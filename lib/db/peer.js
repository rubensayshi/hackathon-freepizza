var bitcore = require('bitcore');
var sha256 = bitcore.crypto.Hash.sha256;

var PeerDB = function(db) {
    var self = this;

    self.db = db;
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

    self.db.query("SELECT * FROM peer WHERE hash = ?", [
        addr.hash
    ], function(err, res) {
        cb(err, res.length ? res[0].id : null);
    });
};

module.exports = PeerDB;
