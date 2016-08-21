(jQuery(function($){
//(function () {

    var JCDECAUX_API_URL = 'https://api.jcdecaux.com/vls/v1/';
    var JCDECAUX_API_KEY = 'eeb5a02e9829290fa6a9e37470fee120e80fa024';

    var map;
    var markers;
    var userPosition = false;
    var userMarker = false;

    var userLine = false; // line with last moves of user
    var routing; // open station way to go
    var stationPosition; // open station coords

    var LOADING_USER = true;
    var LOADING_STATIONS = true;
    var OPENZOOM = 16;

    function loading(text){
        if(text) $('#loader .linfo').html(text);
        if(LOADING_USER==false && LOADING_STATIONS==false) $('#loader').fadeOut(200);
    }

    loading('Chargement de la carte');

    map = L.map('mapdiv', {
        zoomControl : false
    }).setView([48.8534100, 2.3488000], 15);

    L.control.scale({imperial: false}).addTo(map);

    markers = L.markerClusterGroup();

    L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', {
        attribution: '',
        maxZoom: 18
    }).addTo(map);

    loading('Chargement des stations');
    var xhr = $.ajax({
        url: JCDECAUX_API_URL+'stations',
        type: "GET",
        data: {
            apiKey : JCDECAUX_API_KEY,
            contract : 'Paris'
        },
        dataType : 'json',
        success : function(data){

            $.each(data, function(index, elem){
                //console.log(elem);
                setTimeout(function(){

                    var dataObj = {
                        lat     : elem.position.lat,
                        lng     : elem.position.lng,
                        bikes   : parseInt(elem.available_bikes),
                        stands  : parseInt(elem.available_bike_stands),
                        total   : parseInt(elem.bike_stands),
                        name    : elem.name,
                        address : elem.address,
                        bonus   : elem.bonus
                    };

                    dataObj.problems = dataObj.total-(dataObj.bikes+dataObj.stands);
                    dataObj.icon = "http://api.velib.pierros.fr/image.php?v="+dataObj.bikes+"&p="+dataObj.stands+"&n="+dataObj.problems;

                    var stationPos = L.latLng(dataObj.lat, dataObj.lng);
                   
                    var stationIcon = L.icon({
                        iconUrl: dataObj.icon,
                        iconSize: [36, 36],
                        iconAnchor: [18, 18]
                    });
                    
                    var stationMarker = L.marker(stationPos, {
                        icon : stationIcon
                    });

                    //stationMarker.addTo(map);
                    markers.addLayer(stationMarker);

                    stationMarker.on('click', function(e){
                        openStation(dataObj);
                    });

                    //console.log(index+' / '+data.length);

                    loading('Chargement des stations<br />'+(index+1)+'/'+data.length);

                    if((index+1)==data.length){
                        map.addLayer(markers);
                        LOADING_STATIONS = false;

                        geolocUser();
                    }

                }, index*1);

            });

        }
    });

    var geolocUser = function(){
        loading('Recherche de votre position');
        window.navigator.geolocation.getCurrentPosition(geolocSuccess, geolocError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout:15000
        });

        var locationWatcher = navigator.geolocation.watchPosition(updateUserPosition);
    }

    var geolocSuccess = function(p){
        userPosition = L.latLng(p.coords.latitude, p.coords.longitude);
        //userPosition = L.latLng(48.84, 2.36); // screenshots
        var userIncon = L.icon({
            iconUrl: "images/markers/user.png",
            iconSize: [36, 48],
            iconAnchor: [18, 46]
        });
        userMarker = L.marker(userPosition, {icon:userIncon});
        map.setView(userPosition, OPENZOOM);

        userMarker.on('click', function(e){
            zoomOnUser();
        });

        userMarker.addTo(map);

        LOADING_USER = false;
        loading();

        $('#map_zoom_center').removeClass('hidden');
    }

    var geolocError = function(err){
        //alert('ERROR(' + err.code + '): ' + err.message);
        LOADING_USER = false;
        loading();

        $('#map_zoom_center').addClass('hidden');
    }

    var updateUserPosition = function(p){
        if(userMarker){
            userPosition = L.latLng(p.coords.latitude, p.coords.longitude);

            if(!userLine){
                userLine = new L.polyline([userPosition], {
                    color: '#a54d93',
                    weight: 2,
                    opacity: 0.5,
                    smoothFactor: 1
                });
                userLine.addTo(map);
            }else{
                var currentCoords = userLine.getLatLngs();
                if(currentCoords.length>40){
                    currentCoords.shift(); // remove first index
                }
                currentCoords.push(userPosition);
                userLine.setLatLngs(currentCoords);
            }

            if(routing){
                routing.spliceWaypoints(0, 1, userPosition);
            }

            userMarker.setLatLng(userPosition);
        }
    }

    var zoomOnUser = function(){
        if(userPosition){
            var currentZoom = map.getZoom();
            var newZoom = (currentZoom<map.getMaxZoom()) ? currentZoom+1 : map.getMaxZoom();
            map.setView(userPosition, newZoom);
        }
    }

    function openStation(data){
        //console.log(data);

        var $station = $('#station');
        $station.find('h1').html(data.name);
        $station.find('address').html(data.address);

        $station.find('#bikes_count').html(data.bikes);
        $station.find('#stands_count').html(data.stands);

        $station.find('#problems').hide();
        if(data.problems>0){
            $station.find('#problems').show();
            $station.find('#problems_count').html(data.problems);
        }
        
        $station.scrollTop();

        stationPosition = L.latLng(data.lat, data.lng);

        //var zoom = (map.getZoom()<OPENZOOM) ? OPENZOOM : map.getZoom();
        //map.setView(stationPosition, zoom);

        if(userPosition){
            createWay();

        }else{
            var zoom = (map.getZoom()<OPENZOOM) ? OPENZOOM : map.getZoom();
            map.setView(stationPosition, zoom);
        }  

        $station.addClass('open');
    }

    var createWay = function(){
        if(userPosition && stationPosition){
            if(routing) map.removeControl(routing);
            routing = false;

            zoomOnWay();

            routing = L.Routing.control({
                waypoints:  [
                    userMarker.getLatLng(),
                    stationPosition
                ],
                router: L.Routing.mapzen('valhalla-GzwpXJy', {costing:'pedestrian'}),
                formatter: new L.Routing.mapzenFormatter(),
                createMarker: function() { return null; },
                routeLine: function(route) {
                    var line = L.Routing.line(route, {
                        styles : [{color:'#FA3E3E', opacity: 1, weight: 2}],
                        addWaypoints: false,
                        extendToWaypoints: false,
                        routeWhileDragging: false,
                        autoRoute: true,
                        useZoomParameter: false,
                        draggableWaypoints: false                 
                    });
                    return line;
                },
                show:false
            }).addTo(map);

            routing.on('routesfound', function(e){
                var routes = e.routes;
                var route = routes[0];
                //console.log(route);

                var m = Math.round(route.summary.totalDistance*1000);
                var mn = Math.ceil(route.summary.totalTime/60);

                $('#station .address .distance').html('('+m+' mètres, '+mn+' minutes)');
                $('#map_zoom_way').show();
            });
        }
    }

    var zoomOnWay = function(){
        if(userPosition && stationPosition){
            map.fitBounds([
                userMarker.getLatLng(),
                stationPosition
            ], {
                paddingTopLeft:[5, 5],
                paddingBottomRight:[5,110]
            });
        }
    }

    function closeStation(){
        if(routing) map.removeControl(routing);
        routing = false;
        $('#station .address .distance').html('');
        $('#map_zoom_way').hide();
        var $station = $('#station');
        $station.removeClass('open');
        stationPosition = false;
    }

    $('#station .close').click(function(e){
        e.preventDefault();
        closeStation();
    });

    /*$(document).click(function(event) { 
        if(
            !$(event.target).closest('#station').length && 
            !$(event.target).closest('.leaflet-marker-icon').length && 
            !$(event.target).closest('#header .actions .button').length
        ){
            closeStation();
        }
    });*/

    $('#map_zoom_moins').click(function(e){
        e.preventDefault();
        map.zoomOut();
    });

    $('#map_zoom_plus').click(function(e){
        e.preventDefault();
        map.zoomIn();
    });

    $('#map_zoom_center').click(function(e){
        e.preventDefault();
        zoomOnUser();
    });

    $('#map_zoom_way').click(function(e){
        e.preventDefault();
        zoomOnWay();
    });
    

}));
//})();