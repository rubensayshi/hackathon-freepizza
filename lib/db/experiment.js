var async = require('async');
var noop = function() {};

var ExperimentDB = function(db, peerDB) {
    var self = this;

    self.peerDB = peerDB;

    self.db = db;
};

ExperimentDB.prototype.createExperiment = function(chunks, txs, cb) {
    var self = this;

    self.db.query("INSERT INTO experiment (started) VALUES (?)", [
        Math.round((new Date).getTime() / 1000)
    ], function(err, res) {
        if (err) return cb(err);

        var experimentID = res.insertId;

        async.forEach(Object.keys(chunks), function(ichunk, cb) {
            var chunk = chunks[ichunk];
            var tx = txs[ichunk];

            self.db.query("INSERT INTO experiment_chunk (ichunk, tx_hash, tx_raw) VALUES (?, ?, ?)", [
                ichunk, tx.hash, tx.serialize()
            ], function(err, res) {
                console.log(err, res);

                var chunkID = res.insertId;

                async.forEach(chunk, function(peer, cb) {

                    self.peerDB.peerID(peer, function(err, peerID) {
                        self.db.query("INSERT INTO experiment_peer (chunk_id, peer_id) VALUES (?, ?)", [
                            chunkID, peerID
                        ], cb);
                    });
                }, cb);
            });
        }, function(err, res) {
            if (err) return cb(err);

            cb(null, experimentID);
        });

    });
};


module.exports = ExperimentDB;
