/*
* (C) Copyright 2014-2015 Kurento (http://kurento.org/)
*
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the GNU Lesser General Public License
* (LGPL) version 2.1 which accompanies this distribution, and is available at
* http://www.gnu.org/licenses/lgpl-2.1.html
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* Lesser General Public License for more details.
*
*/

function getopts(args, opts)
{
  var result = opts.default || {};
  args.replace(
      new RegExp("([^?=&]+)(=([^&]*))?", "g"),
      function($0, $1, $2, $3) { result[$1] = $3; });

  return result;
};

var args = getopts(location.search,
{
  default:
  {
    ws_uri: 'ws://' + location.hostname + ':8888/kurento',
    file_uri: 'file:///tmp/kurento-hello-world-recording.webm',
    ice_servers: undefined
  }
});

if (args.ice_servers) {
  console.log("Use ICE servers: " + args.ice_servers);
  kurentoUtils.WebRtcPeer.prototype.server.iceServers = JSON.parse(args.ice_servers);
} else {
  console.log("Use freeice")
}

var videoInput;
var videoOutput;
var webRtcPeer;
var client;
var pipeline;

const IDLE = 0;
const DISABLED = 1;
const CALLING = 2;
const PLAYING = 3;

function setStatus(nextState){
  switch(nextState){
    case IDLE:
      $('#start').attr('disabled', false)
      $('#stop').attr('disabled',  true)
      $('#play').attr('disabled',  false)
      break;

    case CALLING:
      $('#start').attr('disabled', true)
      $('#stop').attr('disabled',  false)
      $('#play').attr('disabled',  true)
      break;

    case PLAYING:
      $('#start').attr('disabled', true)
      $('#stop').attr('disabled',  false)
      $('#play').attr('disabled',  true)
      break;

    case DISABLED:
      $('#start').attr('disabled', true)
      $('#stop').attr('disabled',  true)
      $('#play').attr('disabled',  true)
      break;
  }
}


function setIceCandidateCallbacks(webRtcPeer, webRtcEp, onerror)
{
  webRtcPeer.on('icecandidate', function(candidate) {
    console.log("Local candidate:",candidate);

    candidate = kurentoClient.register.complexTypes.IceCandidate(candidate);

    webRtcEp.addIceCandidate(candidate, onerror)
  });

  webRtcEp.on('OnIceCandidate', function(event) {
    var candidate = event.candidate;

    console.log("Remote candidate:",candidate);

    webRtcPeer.addIceCandidate(candidate, onerror);
  });
}


window.onload = function() {
  console = new Console('console', console);

  videoInput = document.getElementById('videoInput');
  videoOutput = document.getElementById('videoOutput');

  setStatus(IDLE);
}

function start() {
  setStatus(DISABLED);
  showSpinner(videoInput, videoOutput);

  var options =
  {
    localVideo: videoInput,
    remoteVideo: videoOutput
  }

  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error)
  {
    if(error) return onError(error)

    this.generateOffer(onStartOffer)
  });
}

function stop() {
  if (webRtcPeer) {
    webRtcPeer.dispose();
    webRtcPeer = null;
  }

  if(pipeline){
    pipeline.release();
    pipeline = null;
  }

  hideSpinner(videoInput, videoOutput);
  setStatus(IDLE);
}

function play(){
  setStatus(DISABLED)
  showSpinner(videoOutput);

  var options =
  {
    localVideo: videoInput,
    remoteVideo: videoOutput
  }

  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error)
  {
    if(error) return onError(error)

    this.generateOffer(onPlayOffer)
  });
}

function onPlayOffer(error, sdpOffer){
  if(error) return onError(error);

  co(function*(){
    try{
      if(!client) client = yield kurentoClient(args.ws_uri);

      pipeline = yield client.create('MediaPipeline');

      var webRtc = yield pipeline.create('WebRtcEndpoint');
      setIceCandidateCallbacks(webRtcPeer, webRtc, onError)

      var player = yield pipeline.create('PlayerEndpoint', {uri : args.file_uri});

      player.on('EndOfStream', stop);

      yield player.connect(webRtc);

      var sdpAnswer = yield webRtc.processOffer(sdpOffer);
      webRtc.gatherCandidates(onError);
      webRtcPeer.processAnswer(sdpAnswer);

      yield player.play()

      setStatus(PLAYING)
    }
    catch(e)
    {
      onError(e);
    }
  })();
}

function onStartOffer(error, sdpOffer)
{
  if(error) return onError(error)

  co(function*(){
    try{
      if(!client)
        client = yield kurentoClient(args.ws_uri);

      pipeline = yield client.create('MediaPipeline');

      var webRtc = yield pipeline.create('WebRtcEndpoint');
      setIceCandidateCallbacks(webRtcPeer, webRtc, onError)

      var recorder = yield pipeline.create('RecorderEndpoint', {uri: args.file_uri});

      yield webRtc.connect(recorder);
      yield webRtc.connect(webRtc);

      yield recorder.record();

      var sdpAnswer = yield webRtc.processOffer(sdpOffer);
      webRtc.gatherCandidates(onError);
      webRtcPeer.processAnswer(sdpAnswer)

      setStatus(CALLING);

    } catch(e){
      onError(e);
    }
  })();
}

function onError(error) {
  if(error)
  {
    console.error(error);
    stop();
  }
}

function showSpinner() {
  for (var i = 0; i < arguments.length; i++) {
    arguments[i].poster = 'img/transparent-1px.png';
    arguments[i].style.background = "center transparent url('img/spinner.gif') no-repeat";
  }
}

function hideSpinner() {
  for (var i = 0; i < arguments.length; i++) {
    arguments[i].src = '';
    arguments[i].poster = 'img/webrtc.png';
    arguments[i].style.background = '';
  }
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
  event.preventDefault();
  $(this).ekkoLightbox();
});
