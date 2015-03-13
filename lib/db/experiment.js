var async = require('async');
var noop = function() {};

var ExperimentDB = function(db, peerDB) {
    var self = this;

    self.peerDB = peerDB;

    self.db = db;
};

ExperimentDB.prototype.createExperiment = function(tx1, tx1Hash, tx2, tx2Hash, tx1Peers, tx2Peers, cb) {
    var self = this;

    self.db.query("INSERT INTO experiment (tx1_raw, tx1_hash, tx2_raw, tx2_hash) VALUES (?, ?, ?, ?)", [
        tx1, tx1Hash, tx2, tx2Hash
    ], function(err, res) {
        if (err) return cb(err);

        var experimentID = res.insertId;

        async.forEach(tx1Peers, function(peer, cb) {
            self.peerDB.peerID(peer, function(err, peerID) {
                self.db.query("INSERT INTO experiment_peer (experiment_id, peer_id, tx) VALUES (?, ?, ?)", [
                    experimentID, peerID, 1
                ], cb);
            });
        }, function(err, res) {
            if (err) return cb(err);

            async.forEach(tx2Peers, function(peer, cb) {
                self.peerDB.peerID(peer, function(err, peerID) {
                    self.db.query("INSERT INTO experiment_peer (experiment_id, peer_id, tx) VALUES (?, ?, ?)", [
                        experimentID, peerID, 2
                    ], cb);
                });
            }, function(err, res) {
                if (err) return cb(err);

                cb(null);
            });
        });

    });
};


module.exports = ExperimentDB;
