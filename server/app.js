/*global require*/
/*global console*/
/*global __dirname*/
/*global oBoard*/
(function () {
    "use strict";

    // Set configuration globally
    global.CONFIG = require(__dirname + '/settings/config');

    var i;
    var app;
    var oGarbageCollector;

    var fs = require('fs');
    var gm = require('gm');
    var http = require('http');
    var mime = require('mime');
    var path = require('path');
    var express = require('express');
    var socketio = require('socket.io');

    app = express();

    var Board = require(CONFIG.ROOT + 'classes/Board');
    var ImageUpload = require(CONFIG.ROOT + 'classes/ImageUpload');
    var GarbageCollector = require(CONFIG.ROOT + 'classes/GarbageCollector');

    var server = http.createServer(app);
    var io = socketio.listen(server);


    // Setup required folder if not exit
    if (!fs.existsSync(CONFIG.ROOT + '../boards/')) {
        fs.mkdirSync(CONFIG.ROOT + '../boards/');
    }

    if (!fs.existsSync(CONFIG.ROOT + '../' + CONFIG.IMG_ROOT)) {
        fs.mkdirSync(CONFIG.ROOT + '../' + CONFIG.IMG_ROOT);
    }

    // Express settings
    app.use(express.bodyParser());
    app.use(express.static(CONFIG.ROOT + '../public/'));

    // Socket io settings
    io.enable('browser client etag');
    io.enable('browser client gzip');
    io.set('log level', 1);
    io.sockets.on('connection', function (socket) {
        // The initial connector for the board api
        socket.on('connect', function (sBoardName) {
            // Initialize Board (and create if not exist)
            var oBoard = new Board(sBoardName, socket);

            // Handle conection lost delete board object
            socket.on('disconnect', function () {
                oBoard.goodBye();
            });
        });
    });


    // Give access to uploaded images and update the modification date to determine if the image can be deleted if it's
    // older than CONFIG.MAX_DAYS_UNUSED
    app.get('/upload/*', function (req, res) {
        var oMediaStream;
        var sFileTarget = __dirname + '/../' + req.url;
        var iAccessTime = Math.round(new Date().getTime() / 1000);

        fs.exists(sFileTarget, function (exists) {
            if (exists) {
                fs.utimes(sFileTarget, iAccessTime, iAccessTime, function (error) {
                    if (!error) {
                        oMediaStream = fs.createReadStream(sFileTarget);
                        res.type(mime.lookup(sFileTarget));
                        oMediaStream.pipe(res);
                    } else {
                        res.send(500, '500 INTERNAL SERVER ERROR');
                    }
                });
            } else {
                res.send(404, '404 NOT FOUND');
            }
        });
    });

    // Upload Wallpaper images
    app.post('/upload-wp', function (req, res) {
        var oImageUpload;
        if (req.files !== undefined && req.files.file instanceof Object) {
            oImageUpload = new ImageUpload(req.files.file, res);

            oImageUpload.process();
        } else {
            res.send(200, 'OK');
        }
    });

    // Remove an uploaded image and it's related thumbs
    app.post('/unlink-wp', function (req, res) {
        var sRemoveFile = req.body.image.split('/').pop();

        fs.exists(CONFIG.ROOT + '../' + CONFIG.IMG_ROOT + '/' + sRemoveFile, function (exists) {
            if (exists) {
                fs.unlink(CONFIG.ROOT + '../' + CONFIG.IMG_ROOT + '/' + sRemoveFile, function (err) {
                    if (err) {
                        console.log(err);
                    }
                });

                fs.unlink(CONFIG.ROOT + '../' + CONFIG.IMG_ROOT + '/' + sRemoveFile.replace(/(.[A-Za-z]*)$/, '.thumb$1'), function (err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }

            // Placed here for faster response
            res.send('done');
        });
    });

    // If you need a custom index page you can place one into public directory
    app.get('/', function (req, res) {
        fs.exists(path.resolve(__dirname + '/../public/index.html'), function (exists) {
            if (exists) {
                res.sendfile(path.resolve(__dirname + '/../public/index.html'));
            } else {
                res.redirect('/do');
            }
        });
    });

    // The dafault path for the memeo board
    app.get('/do', function (req, res) {
        res.sendfile(path.resolve(__dirname + '/../public/do.html'));
    });

    // Handle 404 Errors
    app.get('*', function (req, res) {
        res.send(404, '400 NOT FOUND');
    });

    // Set listening port
    server.listen(CONFIG.PORT);

    //Start the garbageCollector for static files
    oGarbageCollector = new GarbageCollector();
    oGarbageCollector.observe();

    console.log('iHave.to was started on port ' + CONFIG.PORT);
})();