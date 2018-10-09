var Accessory, hap, UUIDGen;


var QVRPro = require('./QVRPro').QVRPro;
var request = require("request");
var et = require('elementtree');
var pollingtoevent = require("polling-to-event");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";


module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-QNAP-QVRPro", "Camera-QNAP-QVRPro", QVRProPlatform, true);
}

function fetchSID(ip, port, ssl, user, password, callback){

  var sid = "";
  var url = (ssl?"https://":"http://") + ip + ":" + port + "/cgi-bin/authLogin.cgi?user=" + user + "&pwd=" + encodeURIComponent(password) + "&service=1";


  request(url, function (error, response, body) {

    if (!error && response.statusCode == 200) {
      
      var etree = et.parse(body);
      sid = etree.findtext('authSid') ? etree.findtext('authSid') : "";
    }

    callback(sid);

  });

}

function keepSIDAlive(QVRProConfig, callback){

  var ip = QVRProConfig.ip;
  var port = QVRProConfig.port;
  var ssl = QVRProConfig.sslOn || false;

  var url = (ssl?"https://":"http://") + ip + ":" + port + "/cgi-bin/authLogin.cgi?sid=" + QVRProConfig.sid;

  request(url, function (error, response, body) {

    if (!error && response.statusCode == 200) {
      console.log("keep sid:" + QVRProConfig.sid);
    }
    else {

      fetchSID(ip, port, ssl, user, password, function (sid) {
        callback(sid);
      });
      
    }

  });

}

function fetchCameras (ip, port, ssl, sid, callback){

  var cameras = [];

  request((ssl?"https://":"http://") + ip + ":" + port + "/qvrpro/apis/camera_status.cgi?x-apima-key=%40APIMA_KEY%40&sid=" + sid +"&act=get_all_status", function (error, response, body) {
    if (!error && response.statusCode == 200) {

      JSON.parse(body).datas.forEach(function(cameraConfig) {
          var guid = cameraConfig.name;
          var name = cameraConfig.guid;

          if (guid && name) {
            cameras.push(cameraConfig);
          }

        });
      }

      callback(cameras);


  });

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
  
  var videoProcessor = self.config.videoProcessor || 'ffmpeg';

  if (self.config.server && self.config.server.ip && self.config.server.port && self.config.server.user && self.config.server.password) {
    
    var configuredAccessories = [];
    var cameras = [];

    var QVRProConfig = self.config.server;
    var ip = QVRProConfig.ip;
    var port = QVRProConfig.port;
    var user = QVRProConfig.user;
    var password = new Buffer(QVRProConfig.password).toString('base64');
    var ssl = QVRProConfig.sslOn || false;

    
    fetchSID(ip, port, ssl, user, password, function (sid) {

      self.log("sid:" + sid);

      if(sid.length > 0){

        QVRProConfig.sid = sid;

        var keepAlive = setInterval( function() { 

          keepSIDAlive(QVRProConfig, function(sid){
            QVRProConfig.sid = sid;
          });


        }, 30000 );

        fetchCameras(ip, port, ssl, QVRProConfig.sid, function (cameras){

          cameras.forEach(function(camera) {
              var uuid = UUIDGen.generate(camera.guid);
              var cameraAccessory = new Accessory(camera.name, uuid, hap.Accessory.Categories.CAMERA);
              var cameraSource = new QVRPro(hap, QVRProConfig, camera, self.log);
              cameraAccessory.configureCameraSource(cameraSource);
              configuredAccessories.push(cameraAccessory);

              self.log("Found Camera:" + camera.name);

          });

          self.api.publishCameraAccessories("Camera-QNAP-QVRPro", configuredAccessories);

        });


      }


    });

  }
}



