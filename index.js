var Accessory, hap, UUIDGen;

var QVRPro = require('./QVRPro').QVRPro;
var WebSocketClient = require('websocket').client;
var request = require("request");
var pollingtoevent = require("polling-to-event");

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-QNAP-QVRPro", "Camera-QNAP-QVRPro", QVRProPlatform, true);
}

function fetchSID(ip, port, ssl, user, password){

  var request = require('request');
  var sid = "";

  request((ssl?"https://":"http://") + ip + ":" + port + "/cgi-bin/authLogin.cgi??user=" + user + "&pwd=" + password + "&service=1", function (error, response, body) {
    if (!error && response.statusCode == 200) {

      sid = body.getElementById('authSid');

    }
  });

  return sid;

}

function fetchCameras(ip, port, ssl, sid){

  var request = require('request');
  var cameras = [];


  request((ssl?"https://":"http://") + ip + ":" + port + "/qvrpro/apis/camera_status.cgi?x-apima-key=%40APIMA_KEY%40&sid=" + sid +"&act=get_all_status", function (error, response, body) {
    if (!error && response.statusCode == 200) {

      body.datas.forEach(function(cameraConfig) {
          var guid = cameraConfig.name;
          var name = cameraConfig.guid;

          if (!guid || !name) {
            self.log("Missing parameters.");
            continue;
          }

          cameras.push(cameraConfig);
        });
      }
  });

  return cameras;

}




function QVRProPlatform(log, config, api) {
  var self = this;

  self.log = log;
  self.config = config || {};

  if (api) {
    self.api = api;

    if (api.version < 2.1) {
      throw new Error("Unexpected API version.");
    }

    self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
  }
}

QVRProPlatform.prototype.configureAccessory = function(accessory) {
  // Won't be invoked
}

QVRProPlatform.prototype.didFinishLaunching = function() {

  var self = this;
  
  var sslOn = self.config.sslOn || false;
  var videoProcessor = self.config.videoProcessor || 'ffmpeg';


  if (self.config.ip && self.config.port && self.config.user && self.config.password) {
    var configuredAccessories = [];

    self.config.sid=fetchSID(self.config.ip, self.config.port, sslOn, self.config.user, self.config.password)
 
    var cameras =  fetchCameras(self.config.ip, self.config.port, sslOn, sslOn, self.config.sid);

    for(i = 0 ; i < sizeof(cameras) ; i++){

      var uuid = UUIDGen.generate(cameras[i].guid);
      var cameraAccessory = new Accessory(cameras[i].name, uuid, hap.Accessory.Categories.CAMERA);
      var cameraSource = new QVRPro(hap, self.config, cameras[i], self.log);
      cameraAccessory.configureCameraSource(cameraSource);
      configuredAccessories.push(cameraAccessory);



    }

    self.api.publishCameraAccessories("Camera-QNAP-QVRPro", configuredAccessories);
  }
}


