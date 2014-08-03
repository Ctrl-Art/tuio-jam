/**
 * Created by momo on 8/1/14.
 */

var Leap = require('leapjs');
var osc = require('osc-min');
var dgram = require('dgram');
var host = "192.168.1.255";
var port = 3333;

var controller = new Leap.Controller();
var cursors = {};
var aliveIds = [];

var udp = dgram.createSocket("udp4");
udp.bind(function(){
    udp.setBroadcast(true);
    console.log("TUIO Server running at", host, "on port", port);
});
var frameId = 0;

setInterval( checkForStaleCursors, 500);

controller.on("frame", function(frame){
    if(frame.pointables.length > 0) {

        var interactionBox = frame.interactionBox;

        for (var i = 0; i < frame.pointables.length;i++) {

            //Get a pointable and add the normalized tip position as a new property
            var pointable = frame.pointables[i];

            var p = interactionBox.normalizePoint(pointable.tipPosition, true);
            pointable.normalizedPoint = { x: p[0], y: p[1], z: p[2] };

            var zMax = 0.9;
            var touching = p[2] < zMax;

            var cursorIsNew = aliveIds.indexOf(pointable.id) === -1;

            // Touch Start
            if (touching && cursorIsNew) {
                cursors[pointable.id] = pointable;
                aliveIds.push(pointable.id);
                onStart(pointable);
            }

            // Touch End
            else if (!touching && !cursorIsNew) {
                delete cursors[pointable.id];
                aliveIds.splice(aliveIds.indexOf(pointable.id), 1);
                onEnd(pointable);
            }

            // Touch Move
            else if (touching && !cursorIsNew) {
                cursors[pointable.id] = pointable;
                onMove(pointable);
            }

        }
    }
});
controller.connect();

function getAliveIds(){
    var aliveArgs = ["alive"];
    for(var i = 0; i < aliveIds.length; i++){
        aliveArgs.push( {
            type: "integer",
            value: aliveIds[i]
        } );
    }
    return aliveArgs;
}

function getTuioPrefix(){
    return "/tuio/2Dcur";
}

function pointableToBuffer(pointable){
    pointable = pointable || null;

    var elements = [];

    var source = {
        address: getTuioPrefix(),
        args: ["source", "LeapTogether@blumac.local"]
    };

    var alive = {
        address: getTuioPrefix(),
        args: getAliveIds()
    };

    var fseq = {
        address: getTuioPrefix(),
        args: ["fseq", {type: "integer", value: frameId}]
    };
    frameId++;

    if(pointable !== null) {
        var pSet = {
            address: getTuioPrefix(),
            args: [
                "set",
                { type: "integer", value: pointable.id },
                pointable.normalizedPoint.x,
                1 - pointable.normalizedPoint.y,
                pointable.tipVelocity[0],
                pointable.tipVelocity[1],
                0.0
            ]
        };

        elements = [source, alive, pSet, fseq];

    } else {

        elements =  [source, alive, fseq];
    }

    return osc.toBuffer({
            oscType: "bundle",
            timetag: 0,
            elements: elements
        })

}

function onStart(pointable){
    var buffer = pointableToBuffer(pointable);
    udp.send(buffer, 0, buffer.length, port, host);
    console.log('pointer start');
}

function onMove(pointable){
    var cursor = cursors[aliveIds[0]];

    pointable.lastActive = new Date().getTime();
    var buffer = pointableToBuffer(pointable);
    udp.send(buffer, 0, buffer.length, port, host);
}

function onEnd(pointable){
    var buffer = pointableToBuffer();
    udp.send(buffer, 0, buffer.length, port, host);
    console.log('pointer end');
}

function checkForStaleCursors(){
    for(var i = aliveIds.length - 1; i >= 0; i--){
        var id = aliveIds[i];
        var pointable = cursors[id];
        if(pointable.valid){
            var timeSinceLastActive = new Date().getTime() - pointable.lastActive;
            if(timeSinceLastActive > 1500){
                delete cursors[id];
                aliveIds.splice(i, 1);
                onEnd(pointable);
            }
        } else {
            aliveIds.splice(i, 1);
        }
    }
}