var bitcore = require('bitcore');
var sha256 = bitcore.crypto.Hash.sha256;

var PeerDB = function(db) {
    var self = this;

    self.db = db;
    self.idMap = {};
};

PeerDB.prototype.addAddr = function(addr, cb) {
    var self = this;

    self.db.query("INSERT IGNORE INTO peer (hash, ipv4, ipv6) VALUES (?, ?, ?)", [
        addr.hash,
        addr.ip.v4 || null,
        addr.ip.v6 || null
    ], cb);
};

PeerDB.prototype.peerID = function(peer, cb) {
    var self = this;

    var addr = {ip: {v4: peer.host}, port: peer.port};
    addr.hash = sha256(new Buffer((addr.ip.v6 || addr.ip.v4) + addr.port)).toString('hex');

    if (self.idMap[addr.hash]) {
        cb(null, self.idMap[addr.hash]);
    } else {
        self.db.query("SELECT * FROM peer WHERE hash = ?", [
            addr.hash
        ], function(err, res) {
            if (res.length) {
                var peerID = res[0].id;

                self.idMap[addr.hash] = peerID;

                cb(null, peerID);
            } else {
                cb(err || new Error("Not found"));
            }
        });
    }
};

module.exports = PeerDB;
