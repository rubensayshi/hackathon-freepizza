var async = require('async');
var bitcore = require("bitcore");
var bitcoreP2P = require("bitcore-p2p");
var Networks = bitcore.Networks;
var debug = require('debug');
var _ = require('lodash');
var Random = bitcore.crypto.Random;
var Messages = require('bitcore-p2p/lib/messages');
var mysql      = require('mysql');

var Pool = require('lib/pool');
var PeerDB = require('lib/db/peer');
var ExperimentDB = require('lib/db/experiment');

var mysqlPool = mysql.createPool({
    connectionLimit : 10,
    host     : 'localhost',
    user     : 'root',
    password : 'root',
    database : 'freepizza'
});

var peerDB = new PeerDB(mysqlPool);
var experimentDB = new ExperimentDB(mysqlPool, peerDB);

var pool = new Pool(Networks.livenet, {
    maxSize: 1,
    listenAddr: false,
    dnsSeed: false
});

var txDB = {};

function doExperiment() {
    var tx1 = "";
    var tx1Hash = Random.getRandomBuffer(32);

    var tx2 = "";
    var tx2Hash = Random.getRandomBuffer(32);

    var tx1Peers = [
        pool._connectedPeers['4d42e796e922cd757aaa238fdefd24b80da75ca182551b88b9ddfa39d034e77e']
    ];
    var tx2Peers = [];

    txDB[tx1Hash] = tx1;
    txDB[tx2Hash] = tx2;

    var tx1Inv = [{
        type: Messages.Inventory.TYPE.TX,
        hash: tx1Hash
    }];

    var tx2Inv = [{
        type: Messages.Inventory.TYPE.TX,
        hash: tx2Hash
    }];

    var tx1Message = new Messages.Inventory(tx1Inv);
    var tx2Message = new Messages.Inventory(tx2Inv);

    debug('EXPERIMENT')('SENDING %s %s', tx1Hash, tx2Hash);

    experimentDB.createExperiment(tx1, tx1Hash, tx2, tx2Hash, tx1Peers, tx2Peers, function(err, res) {
        if (err) throw err;

        async.parallel([
            function(cb) {
                async.forEach(tx1Peers, function(peer, cb) {
                    peer.sendMessage(tx1Message);
                    cb();
                }, cb);
            },
            function(cb) {
                async.forEach(tx2Peers, function(peer, cb) {
                    peer.sendMessage(tx2Message);
                    cb();
                }, cb);
            }
        ], function(err, res) {
            debug('EXPERIMENT')('DONE %o %o', err, res);
        });
    });
};

function sendTx(tx) {
    var txHash = Random.getRandomBuffer(32);

    txDB[txHash] = tx;

    debug('SEND TX')('%s', txHash.toString('hex'));

    var inv = [{
        type: Messages.Inventory.TYPE.TX,
        hash: txHash
    }];

    var peer = 'x';

    var message = new Messages.Inventory(inv);
    peer.sendMessage(message);
}

pool.on('peergetdata', function(peer, message) {
    _.forEach(message.inventory, function(inv) {
        if (inv.type === 1) {
            var txHash = inv.hash.toString('hex');

            debug('GETDATA')('TX %s', txHash);

            if (!txDB[txHash]) {

            } else {
                var tx = txDB[txHash];

                peer.sendMessage(Messages.Transaction.fromBuffer(tx));
            }
        }
    });
});

pool.on('peerinv', function(peer, message) {
    // TX
    _.forEach(message.inventory, function(inv) {
        if (inv.type === 1) {
            debug('INV')('TX %s', inv.hash.toString('hex'));
        }
    });
});

pool.on('seed', function seedEvent(ips) {
    var self = this;

    _.forEach(ips, function(ip) {
        var addr = {ip: {v4: ip}};
        addr.hash = self.hashAddr(addr);

        peerDB.addAddr(addr);
    });
});

pool.on('peeraddr', function(peer, message) {
    debug('ADDR')('%o', message);
    this._fillConnections();
});

setInterval(function() {
    debug('STATUS')(pool.inspect());
}, 10000);


pool.on('peerready', function(peer) {
    debug('READY')('PEER READY %s', peer.host);

    doExperiment();
});

// tmp
var addr = {
    ip: {
        v4: '127.0.0.1'
    },
    port: 8333
};
addr.hash = pool.hashAddr(addr);
peerDB.addAddr(addr);
pool._addAddr(addr);

pool.connect();
