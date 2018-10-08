'use strict';
var uuid, Service, Characteristic, StreamController;

var crypto = require('crypto');
var fs = require('fs');
var ip = require('ip');
var spawn = require('child_process').spawn;

module.exports = {
  QVRPro: QVRPro
};

function QVRPro(hap, QVRProConfig, cameraConfig, log) {
  uuid = hap.uuid;
  Service = hap.Service;
  Characteristic = hap.Characteristic;
  StreamController = hap.StreamController;
  this.log = log;

  if (!cameraConfig) {
    throw new Error("Missing source for camera.");
  }


  var QVRPro.pt = QVRProConfig;
  var ssl = QVRProConfig.sslOn;
  this.name = cameraConfig.name;
  this.guid = cameraConfig.guid;
  this.videoProcessor = QVRProConfig.videoProcessor || 'ffmpeg';
  this.additionalCommandline = QVRProConfig.additionalCommandline || '-tune zerolatency';


  this.QVRPro.ource = "-re -i " +  (ssl?"https://":"http://") + ip + ":" + port + "/qvrpro/streaming/getstream.cgi?sid="+QVRProConfig.sid+"&ch_sid="+this.guid+"&stream_id=0&audio=1&utc=1";
  this.QVRPro.mageSource = "-i " +  (ssl?"https://":"http://") + ip + ":" + port + "/qvrpro/apis/getliveimage.cgi?sid="+QVRProConfig.sid+"&guid="+this.guid;

 self.log("stream url : " + this.QVRPro.ource);


  this.services = [];
  this.streamControllers = [];

  this.pendingSessions = {};
  this.ongoingSessions = {};

  this.uploader = cameraConfig.uploader || false;
  if ( this.uploader )
    { this.drive = new drive(); }

  var numberOfStreams = QVRPro.pt.maxStreams || 2;
  var videoResolutions = [];

  this.maxWidth = QVRPro.pt.maxWidth || 1280;
  this.maxHeight = QVRPro.pt.maxHeight || 720;
  var maxFPS = (this.fps > 30) ? 30 : this.fps;

  if (this.maxWidth >= 320) {
    if (this.maxHeight >= 240) {
      videoResolutions.push([320, 240, maxFPS]);
      if (maxFPS > 15) {
        videoResolutions.push([320, 240, 15]);
      }
    }

    if (this.maxHeight >= 180) {
      videoResolutions.push([320, 180, maxFPS]);
      if (maxFPS > 15) {
        videoResolutions.push([320, 180, 15]);
      }
    }
  }

  if (this.maxWidth >= 480) {
    if (this.maxHeight >= 360) {
      videoResolutions.push([480, 360, maxFPS]);
    }

    if (this.maxHeight >= 270) {
      videoResolutions.push([480, 270, maxFPS]);
    }
  }

  if (this.maxWidth >= 640) {
    if (this.maxHeight >= 480) {
      videoResolutions.push([640, 480, maxFPS]);
    }

    if (this.maxHeight >= 360) {
      videoResolutions.push([640, 360, maxFPS]);
    }
  }

  if (this.maxWidth >= 1280) {
    if (this.maxHeight >= 960) {
      videoResolutions.push([1280, 960, maxFPS]);
    }

    if (this.maxHeight >= 720) {
      videoResolutions.push([1280, 720, maxFPS]);
    }
  }

  if (this.maxWidth >= 1920) {
    if (this.maxHeight >= 1080) {
      videoResolutions.push([1920, 1080, maxFPS]);
    }
  }

  let options = {
    proxy: false, // Requires RTP/RTCP MUX Proxy
    srtp: true, // Supports SRTP AES_CM_128_HMAC_SHA1_80 encryption
    video: {
      resolutions: videoResolutions,
      codec: {
        profiles: [0, 1, 2], // Enum, please refer StreamController.VideoCodecParamProfileIDTypes
        levels: [0, 1, 2] // Enum, please refer StreamController.VideoCodecParamLevelTypes
      }
    },
    audio: {
      codecs: [
        {
          type: "OPUS", // Audio Codec
          samplerate: 24 // 8, 16, 24 KHz
        },
        {
          type: "AAC-eld",
          samplerate: 16
        }
      ]
    }
  }

  this.createCameraControlService();
  this._createStreamControllers(numberOfStreams, options);
}

QVRPro.prototype.handleCloseConnection = function(connectionID) {
  this.streamControllers.forEach(function(controller) {
    controller.handleCloseConnection(connectionID);
  });
}

QVRPro.prototype.handleSnapshotRequest = function(request, callback) {
  let resolution = request.width + 'x' + request.height;
  var imageSource = this.QVRPro.mageSource !== undefined ? this.QVRPro.mageSource : this.QVRPro.ource;
  let QVRPro.= spawn(this.videoProcessor, (imageSource + ' -t 1 -s '+ resolution + ' -f image2 -').split(' '), {env: process.env});
  var imageBuffer = Buffer(0);
  this.log("Snapshot from " + this.name + " at " + resolution);
  if(this.debug) console.log('QVRPro.'+imageSource + ' -t 1 -s '+ resolution + ' -f image2 -');
  QVRPro.stdout.on('data', function(data) {
    imageBuffer = Buffer.concat([imageBuffer, data]);
  });
  let self = this;
  QVRPro.on('error', function(error){
    self.log("An error occurs while making snapshot request");
    self.debug ? self.log(error) : null;
  });
  QVRPro.on('close', function(code) {
    if ( this.uploader )
      { this.drive.storePicture(this.name,imageBuffer); }
    callback(undefined, imageBuffer);
  }.bind(this));
}

QVRPro.prototype.prepareStream = function(request, callback) {
  var sessionInfo = {};

  let sessionID = request["sessionID"];
  let targetAddress = request["targetAddress"];

  sessionInfo["address"] = targetAddress;

  var response = {};

  let videoInfo = request["video"];
  if (videoInfo) {
    let targetPort = videoInfo["port"];
    let srtp_key = videoInfo["srtp_key"];
    let srtp_salt = videoInfo["srtp_salt"];

    // SSRC is a 32 bit integer that is unique per stream
    let ssrcSource = crypto.randomBytes(4);
    ssrcSource[0] = 0;
    let ssrc = ssrcSource.readInt32BE(0, true);

    let videoResp = {
      port: targetPort,
      ssrc: ssrc,
      srtp_key: srtp_key,
      srtp_salt: srtp_salt
    };

    response["video"] = videoResp;

    sessionInfo["video_port"] = targetPort;
    sessionInfo["video_srtp"] = Buffer.concat([srtp_key, srtp_salt]);
    sessionInfo["video_ssrc"] = ssrc;
  }

  let audioInfo = request["audio"];
  if (audioInfo) {
    let targetPort = audioInfo["port"];
    let srtp_key = audioInfo["srtp_key"];
    let srtp_salt = audioInfo["srtp_salt"];

    // SSRC is a 32 bit integer that is unique per stream
    let ssrcSource = crypto.randomBytes(4);
    ssrcSource[0] = 0;
    let ssrc = ssrcSource.readInt32BE(0, true);

    let audioResp = {
      port: targetPort,
      ssrc: ssrc,
      srtp_key: srtp_key,
      srtp_salt: srtp_salt
    };

    response["audio"] = audioResp;

    sessionInfo["audio_port"] = targetPort;
    sessionInfo["audio_srtp"] = Buffer.concat([srtp_key, srtp_salt]);
    sessionInfo["audio_ssrc"] = ssrc;
  }

  let currentAddress = ip.address();
  var addressResp = {
    address: currentAddress
  };

  if (ip.isV4Format(currentAddress)) {
    addressResp["type"] = "v4";
  } else {
    addressResp["type"] = "v6";
  }

  response["address"] = addressResp;
  this.pendingSessions[uuid.unparse(sessionID)] = sessionInfo;

  callback(response);
}

QVRPro.prototype.handleStreamRequest = function(request) {
  var sessionID = request["sessionID"];
  var requestType = request["type"];
  if (sessionID) {
    let sessionIdentifier = uuid.unparse(sessionID);

    if (requestType == "start") {
      var sessionInfo = this.pendingSessions[sessionIdentifier];
      if (sessionInfo) {
        var width = 1280;
        var height = 720;
        var fps = this.fps || 30;
        var vbitrate = this.maxBitrate;
        var abitrate = 32;
        var asamplerate = 16;
        var vcodec = this.vcodec || 'libx264';
        var acodec = this.acodec || 'libfdk_aac';
        var packetsize = this.packetsize || 1316; // 188 376
        var additionalCommandline = this.additionalCommandline ;

        let videoInfo = request["video"];
        if (videoInfo) {
          width = videoInfo["width"];
          height = videoInfo["height"];

          let expectedFPS = videoInfo["fps"];
          if (expectedFPS < fps) {
            fps = expectedFPS;
          }
          if(videoInfo["max_bit_rate"] < vbitrate) {
            vbitrate = videoInfo["max_bit_rate"];
          }
        }

        let audioInfo = request["audio"];
        if (audioInfo) {
          abitrate = audioInfo["max_bit_rate"];
          asamplerate = audioInfo["sample_rate"];
        }

        let targetAddress = sessionInfo["address"];
        let targetVideoPort = sessionInfo["video_port"];
        let videoKey = sessionInfo["video_srtp"];
        let videoSsrc = sessionInfo["video_ssrc"];
        let targetAudioPort = sessionInfo["audio_port"];
        let audioKey = sessionInfo["audio_srtp"];
        let audioSsrc = sessionInfo["audio_ssrc"];

        let QVRPro.ommand = this.QVRPro.ource + ' -map 0:0' +
          ' -vcodec ' + vcodec +
          ' -pix_fmt yuv420p' +
          ' -r ' + fps +
          ' -f rawvideo' +
          ' ' + additionalCommandline +
          ' -vf scale=' + width + ':' + height +
          ' -b:v ' + vbitrate + 'k' +
          ' -bufsize ' + vbitrate+ 'k' +
          ' -maxrate '+ vbitrate + 'k' +
          ' -payload_type 99' +
          ' -ssrc ' + videoSsrc +
          ' -f rtp' +
          ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80' +
          ' -srtp_out_params ' + videoKey.toString('base64') +
          ' srtp://' + targetAddress + ':' + targetVideoPort +
          '?rtcpport=' + targetVideoPort +
          '&localrtcpport=' + targetVideoPort +
          '&pkt_size=' + packetsize;

        if(this.audio){
          QVRPro.ommand+= ' -map 0:1' +
            ' -acodec ' + acodec +
            ' -profile:a aac_eld' +
            ' -flags +global_header' +
            ' -f null' +
            ' -ar ' + asamplerate + 'k' +
            ' -b:a ' + abitrate + 'k' +
            ' -bufsize ' + abitrate + 'k' +
            ' -ac 1' +
            ' -payload_type 110' +
            ' -ssrc ' + audioSsrc +
            ' -f rtp' +
            ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80' +
            ' -srtp_out_params ' + audioKey.toString('base64') +
            ' srtp://' + targetAddress + ':' + targetAudioPort +
            '?rtcpport=' + targetAudioPort +
            '&localrtcpport=' + targetAudioPort +
            '&pkt_size=' + packetsize;
        }

        let QVRPro.= spawn(this.videoProcessor, QVRPro.ommand.split(' '), {env: process.env});
        this.log("Start streaming video from " + this.name + " with " + width + "x" + height + "@" + vbitrate + "kBit");
        if(this.debug){
          console.log("QVRPro." + QVRPro.ommand);
        }

        // Always setup hook on stderr.
        // Without this streaming stops within one to two minutes.
        QVRPro.stderr.on('data', function(data) {
          // Do not log to the console if debugging is turned off
          if(this.debug){
            console.log(data.toString());
          }
        });
        let self = this;
        QVRPro.on('error', function(error){
            self.log("An error occurs while making stream request");
            self.debug ? self.log(error) : null;
        });
        QVRPro.on('close', (code) => {
          if(code == null || code == 0 || code == 255){
            self.log("Stopped streaming");
          } else {
            self.log("ERROR: QVRPro.exited with code " + code);
            for(var i=0; i < self.streamControllers.length; i++){
              var controller = self.streamControllers[i];
              if(controller.sessionIdentifier === sessionID){
                controller.forceStop();
              }
            }
          }
        });
        this.ongoingSessions[sessionIdentifier] = QVRPro.
      }

      delete this.pendingSessions[sessionIdentifier];
    } else if (requestType == "stop") {
      var QVRPro.rocess = this.ongoingSessions[sessionIdentifier];
      if (QVRPro.rocess) {
        QVRPro.rocess.kill('SIGTERM');
      }
      delete this.ongoingSessions[sessionIdentifier];
    }
  }
}

QVRPro.prototype.createCameraControlService = function() {
  var controlService = new Service.CameraControl();

  this.services.push(controlService);

  if(this.audio){
    var microphoneService = new Service.Microphone();
    this.services.push(microphoneService);
  }
}

// Private

QVRPro.prototype._createStreamControllers = function(maxStreams, options) {
  let self = this;

  for (var i = 0; i < maxStreams; i++) {
    var streamController = new StreamController(i, options, self);

    self.services.push(streamController.service);
    self.streamControllers.push(streamController);
  }
}
