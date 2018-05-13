var exec = require("child_process").exec;
var express = require('express');
var multer = require("multer");
var app = express();
var mysql = require("mysql");
var router = express.Router();
var fs = require('fs');
var SqlString = require('sqlstring');
var bodyParser = require("body-parser");
var cors = require('cors');
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");

var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'GreekRocket777',
  database : 'slusaj_db'
});

connection.connect();

var storage = multer.diskStorage({
  destination: "./assets",
  filename(req, file, cb) {
    cb(null, new Date() + "-" + file.originalName);
  }
});

var upload = multer();

app.use(cors());
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

// GET method route
app.get('/', function (req, res) {
  res.send('GET request to the homepage');
});

app.get('/api/v1/all-artists', function(req, res, next) {
  connection.query("SELECT name from artists;", function(err, rows, fields) {
    if (err) throw err;
    console.log("rows", rows);
    res.send(JSON.stringify({"status":200, "error":null, "response":rows}));
  });
});

app.get('/api/v1/all-songs', function(req, res, next) {
  console.log("req", req);
  connection.query("SELECT songs.title, artists.name from songs INNER JOIN artists ON songs.artist_id=artists.id", function(err, rows, fields) {
    if (err) throw err;
    console.log("rows", rows);
    res.send(JSON.stringify({"status":200, "error":null, "response":rows}));
  });
});

app.get('/api/v1/:artistName/all-songs', function(req, res, next) {
  var artistName = req.params.artistName;
  connection.query("SELECT songs.title, artists.name from songs INNER JOIN artists ON songs.artist_id=artists.id WHERE artists.name = '"+ artistName +"';", function(err, rows, fields) {
    if (err || !rows) {
      res.send(JSON.stringify({"status":404, "error":artistName, "response":"No songs were found."}));
      return;
    }
    console.log("rows", rows);
    res.send(JSON.stringify({"status":200, "error":null, "response":rows}));
  });
});

app.get('/api/v1/:artist/all-songs', function(req, res, next) {
  var artist = req.params.artist;
  connection.query("SELECT songs.title from songs INNER JOIN artists ON songs.artist_id=artists.id AND artists.name='"+ artist +"';", function(err, rows, fields) {
    if (err) throw err;
    console.log("rows", rows);
    res.send(JSON.stringify({"status":200, "error":null, "response":rows}));
  });
});

app.get('/api/v1/search/:searchString', function(req, res, next) {
  console.log("req", req.params.searchString);
  connection.query("SELECT songs.title, artists.name from songs INNER JOIN artists ON songs.artist_id=artists.id WHERE songs.title LIKE '%" + req.params.searchString + "%'" , function(err, rows, fields) {
    if (!err) {
      var queriedSongs = rows;
      connection.query("SELECT `name` from `artists` WHERE `name` LIKE '%"+ req.params.searchString +"%';", function(err, rows, fields) {
        if (!err) res.send(JSON.stringify({"status":200, "error":null, "response":{"songs":queriedSongs, "artists":rows}}));
      });
    }
  });
});

app.get('/api/v1/search/artists/:searchString', function(req, res, next) {
  console.log(req.params);
  if (!req.params.searchString) {
    connection.query("SELECT name from artists;", function(err, rows, fields) {
      if (err) throw err;
      console.log("rows", rows);
      res.send(JSON.stringify({"status":200, "error":null, "response":rows}));
    });
  } else {
    connection.query("SELECT `name` from `artists` WHERE `name` LIKE '%"+ req.params.searchString +"%';", function(err, rows, fields) {
      if (!err) res.send(JSON.stringify({"status":200, "error":null, "response":rows}));
    });
  }
});

app.post('/api/v1/add-artist', upload.single("image"), function(req, res, next) {
  var newDir = "/var/www/slusaj.ba/assets/artists/";
  var fullArtistName = req.body.artistName;
  if (req.body.artistLastName) fullArtistName += " " + req.body.artistLastName;
  newDir = newDir + fullArtistName;
  console.log(req.file);
  var fullArtistNameSql = SqlString.escape(fullArtistName);
  fs.mkdir(newDir, function(err) {
    if (err) {
      res.send(JSON.stringify({"status":500, "error":fullArtistName, "response":"Artist dir could not be created."}));
      console.log(err);
      return;
    }
    fs.writeFile(newDir+"/img.jpg", req.file.buffer, "base64", function(err) {
      if (err) {
        res.send(JSON.stringify({"status":500, "error":fullArtistName, "response":"Artist img could not be created."}));
        console.log(err);
        return;
      }
      const resizeImgCmd = 'convert "'+ newDir +'/img.jpg" -resize 1024x1024 "'+ newDir +'/img_BIG.jpg"';
      console.log(resizeImgCmd);
      exec(resizeImgCmd, function(err) {
        if (err) {
          res.send(JSON.stringify({"status":500,"error":req.body.songName,"response":"Greska prilikom slanja."}));
          return;
        }
	const resizeSmallImgCmd = 'convert "'+ newDir +'/img.jpg" -resize 200x200 "'+ newDir +'/img_SMALL.jpg"';
        exec(resizeSmallImgCmd, function(err) {
          if (err) {
            res.send(JSON.stringify({"status":500,"error":req.body.songName,"response":"Greska prilikom slanja."}));
            return;
          }
          const isGroup = req.body.isGroup ? 1 : 0;
          let query = "INSERT INTO `artists` (`id`, `name`, `isApproved`, `isGroup`) VALUES (NULL, "+ fullArtistNameSql  +", '0', '"+ isGroup +"');";
          connection.query(query, function(err, rows, fields) {
            if (err) {
              res.send(JSON.stringify({"status":500, "error":fullArtistName, "response":"Artist could not be inserted into the database."}));
              console.log(err);
              return;
            }
            res.send(JSON.stringify({"status":200, "error":null, "response":fullArtistName}));
          });
        });
      });
    });
  });
});

app.post('/api/v1/add-song/:artistName', upload.single("song"), function(req, res, next) {
  var artist = req.params.artistName;
  var file = req.file;
  var artistDir = "/var/www/slusaj.ba/assets/artists/"+artist;
  connection.query("SELECT `id` from `artists` WHERE `name` = '"+ artist +"';", function(err, rows, fields) {
    console.log(rows);
    const id = rows.length > 0 ? rows[0].id : null;
    if (err || !id) {
      res.send(JSON.stringify({"status":404,"error":"Artist not found","response":"Izođač ne postoji."}));
      return;
    }
  connection.query("SELECT `id` from `songs` WHERE title = '"+ req.body.songName +"' AND artist_id = '"+ id + "';", function(err, rows, fields) {
    console.log(id, rows, err);
    if (err || (rows && rows[0] && rows[0].id)) {
      res.send(JSON.stringify({"status":500,"error":"Song already exists.","response":"Pjesma već postoji."}));
      return;
    }
    fs.writeFile(artistDir+"/"+req.body.songName+".mp3", file.buffer, function(err) {
      if (err) {
        res.send(JSON.stringify({"status":500,"error":"Song could not be written to file.","response":"Greska prilikom slanja.."}));
        return;
      }
      const cmd = 'id3v2 -a "'+ artist  +'" -t "'+ req.body.songName +'" -A ""  -c "" -y "" -T "" "'+ artistDir+"/"+req.body.songName+ '.mp3"';
      console.log(cmd);
      exec(cmd, function(err) {
        if (err) {
          res.send(JSON.stringify({"status":500,"error":req.body.songName,"response":"Greska prilikom slanja."}));
          return;
        }
        connection.query("INSERT INTO `songs` (`id`, `artist_id`, `title`) VALUES (NULL, " + "'" +
                         id + "', '"+ req.body.songName +"');", function(err, rows, fileds) {
          if (err) {
            res.send(JSON.stringify({"status":500,"error":"Song could not be saved to database.","response":"Greska prilikom slanja."}));
            return;
          }
          res.send(JSON.stringify({"status":200, "error":null, "response":"Upload was success"}));
        });
      });
    });
  });
  });
});

app.post('/api/v1/add-song-youtube/:artistName', function(req, res, next) {
  var artist = req.params.artistName;
  var youtubeId = req.body.youtubeId;
  console.log(youtubeId);
  var artistDir = "/var/www/slusaj.ba/assets/artists/"+artist;
  connection.query("SELECT `id` from `artists` WHERE `name` = '"+ artist +"';", function(err, rows, fields) {
    console.log(rows);
    const id = rows.length > 0 ? rows[0].id : null;
    if (err || !id) {
      res.send(JSON.stringify({"status":404,"error":"Artist not found","response":"Izođač ne postoji."}));
      return;
    }
    connection.query("SELECT `id` from `songs` WHERE title = '"+ req.body.songName +"' AND artist_id = '"+ id + "';", function(err, rows, fields) {
      if (err || (rows && rows[0] && rows[0].id)) {
        res.send(JSON.stringify({"status":500,"error":"Song already exists.","response":"Pjesma već postoji."}));
        return;
      }
      let stream;
      try {
      stream = ytdl(youtubeId, {
        quality: 'highestaudio',
        //filter: 'audioonly',
      });
      } catch (e) {
        res.send(JSON.stringify({"status":404,"error":req.body.youtubeId,"response":"Greska prilikom slanja."})); 
        return;
      }
      ffmpeg(stream)
        .audioBitrate(128)
        .save(artistDir +'/'+ req.body.songName +'.mp3')
        .on("progress", (p) => console.log(p.targetSize))
        .on("end", () => {
          console.log("Finished");
          const cmd = 'id3v2 -a "'+ artist  +'" -t "'+ req.body.songName +'" -A ""  -c "" -y "" -T "" "'+ artistDir+"/"+req.body.songName+ '.mp3"';
          exec(cmd, function(err) {
            if (err) {
              res.send(JSON.stringify({"status":500,"error":req.body.songName,"response":"Greska prilikom slanja."}));
              return;
            }
            connection.query("INSERT INTO `songs` (`id`, `artist_id`, `title`) VALUES (NULL, " + "'" +
                           id + "', '"+ req.body.songName +"');", function(err, rows, fileds) {
              if (err) {
                res.send(JSON.stringify({"status":500,"error":"Song could not be saved to database.","response":"Greska prilikom slanja."}));
                return;
              }
              res.send(JSON.stringify({"status":200, "error":null, "response":"Upload was success"}));
            });
          });
        });
    });
  });
});
app.listen(3000);
