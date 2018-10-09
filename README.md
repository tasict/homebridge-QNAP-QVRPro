This plugins is not QNAP offical plugins. 


```
{
    "bridge": {
        "name": "Homebridge",
        "username": "24:5E:BE:0E:DA:04",
        "port": 51826,
        "pin": "123-45-678"
    },
    "description": "This is an example configuration file. You can use this as a template for creating your own configuration file containing devices you actually own.",
    "accessories": [],
    "platforms": [
        {
            "platform": "Camera-QNAP-QVRPro",
            "server": {
                "ip": "_NAS_IP_",
                "port": "_QTS_ACCESS_PORT",
                "sslOn": false,
                "user": "USER",
                "password": "PASSWORD",
                "maxStreams": 2,
                "maxWidth": 1280,
                "maxHeight": 720,
                "maxFPS": 30
            }
        }
    ]
}
```
