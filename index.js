var async = require('async');
var bitcore = require("bitcore");
var bitcoreP2P = require("bitcore-p2p");
var Networks = bitcore.Networks;
var debug = require('debug');
var _ = require('lodash');
var crypto = require('crypto');
var Random = bitcore.crypto.Random;
var Messages = require('bitcore-p2p/lib/messages');
var mysql      = require('mysql');
var HDPrivateKey = bitcore.HDPrivateKey;
var PrivateKey = bitcore.PrivateKey;
var Transaction = bitcore.Transaction;
var blocktrail = require('blocktrail-sdk');
var client = blocktrail.BlocktrailSDK({
    apiKey : "MY_APIKEY",
    apiSecret : "MY_APISECRET"
});

var Pool = require('lib/pool');
var PeerDB = require('lib/db/peer');
var ExperimentDB = require('lib/db/experiment');

var hdPrivKey = new HDPrivateKey("xprv9s21ZrQH143K35hXpQfuktrDZnjaVm7DsbmNba6DkTY8BGsmcjiuWpdAC6AoU2jttzTb44n7MyXhyuHCpychuXXHhfgGMPt9wbLBPopwGsA");

var mysqlPool = mysql.createPool({
    connectionLimit : 10,
    host     : 'localhost',
    user     : 'root',
    password : 'root',
    database : 'freepizza'
});

var peerDB = new PeerDB(mysqlPool);
var experimentDB = new ExperimentDB(mysqlPool, peerDB);

var experimentInProgress = false;

var pool = new Pool(Networks.livenet, {
    maxSize: 2,
    listenAddr: false,
    dnsSeed: false
});

var txDB = {};

function buildExperimentTxs(cb) {
    var sourcePrivKey = hdPrivKey.derive(0).privateKey;

    client.addressUnspentOutputs(sourcePrivKey.toAddress(), function(err, result) {
        if (err) return cb(err);

        var utxo = result.data[0];
        var value = _.random(10000, 20000);

        debug('EXPERIMENT')('SPENDING %d satoshi of %s %d', value, utxo.hash, utxo.index);

        var txs = {};

        for (var i = 0; i < ichunks; i++) {

        }

        var tx1 = (new Transaction())
            .from({
                txId: utxo.hash,
                outputIndex: utxo.index,
                satoshis: utxo.value,
                script: utxo.script_hex
            })
            .to(privateKey2.toAddress(), value)
            .change(privateKey1.toAddress())
            .sign([privateKey1, privateKey2, privateKey3]);

        var tx2 = (new Transaction())
            .from({
                txId: utxo.hash,
                outputIndex: utxo.index,
                satoshis: utxo.value,
                script: utxo.script_hex
            })
            .to(privateKey3.toAddress(), value)
            .change(privateKey1.toAddress())
            .sign([privateKey1, privateKey2, privateKey3]);

        cb(null, tx1, tx2);
    });
};

function doExperiment() {
    var ichunks = 10;

    buildExperimentTxs(ichunks, function(err, tx1, tx2) {

        var tx1Hash = tx1.hash;
        var tx2Hash = tx2.hash;

        var chunks = {};

        async.forEach(Object.keys(pool._connectedPeers), function(hash, cb) {
            var peer = pool._connectedPeers[hash];
            peerDB.peerID(peer, function(err, peerID) {
                var ichunk = peerID % ichunks;

                if (!chunks[ichunk]) {
                    chunks[ichunk] = [];
                }

                chunks[ichunk].push(peer);

                cb();
            });
        }, function(err, res) {
            txDB[tx1Hash] = tx1;
            txDB[tx2Hash] = tx2;

            var tx1Inv = [{
                type: Messages.Inventory.TYPE.TX,
                hash: new Buffer(tx1Hash, 'hex')
            }];

            var tx2Inv = [{
                type: Messages.Inventory.TYPE.TX,
                hash: new Buffer(tx2Hash, 'hex')
            }];

            var tx1Message = new Messages.Inventory(tx1Inv);
            var tx2Message = new Messages.Inventory(tx2Inv);

            debug('EXPERIMENT')('TX1 %s - %d peers', tx1Hash, tx1Peers.length);
            debug('EXPERIMENT')('TX2 %s - %d peers', tx2Hash, tx2Peers.length);

            experimentDB.createExperiment(tx1.serialize(), tx1Hash, tx2.serialize(), tx2Hash, tx1Peers, tx2Peers, function(err, experimentID) {
                if (err) throw err;

                debug('EXPERIMENT')('EID %d', experimentID);

                async.parallel([
                    function(cb) {
                        debug('EXPERIMENT')('TX1PEERS %d', tx1Peers.length);
                        async.forEach(tx1Peers, function(peer, cb) {
                            debug('EXPERIMENT')('INV1 %s %o', peer.host, tx1Message);
                            peer.sendMessage(tx1Message);
                            cb();
                        }, cb);
                    },
                    function(cb) {
                        debug('EXPERIMENT')('TX2PEERS %d', tx1Peers.length);
                        async.forEach(tx2Peers, function(peer, cb) {
                            debug('EXPERIMENT')('INV2 %s %o', peer.host, tx1Message);
                            peer.sendMessage(tx2Message);
                            cb();
                        }, cb);
                    }
                ], function(err, res) {
                    debug('EXPERIMENT')('INIT DONE %o %o', err, res);

                    setTimeout(function() {
                        client.transaction(tx1Hash, function(err1, res1) {
                            client.transaction(tx2Hash, function(err2, res2) {
                                console.log(err1, res1);
                                console.log(err2, res2);

                            });
                        });
                    }, 5000);
                });
            });
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

            if (!txDB[txHash]) {
                debug('GETDATA')('UNKNOWN TX %s', txHash);

            } else {
                debug('GETDATA')('TX %s', txHash);

                var tx = txDB[txHash];

                peer.sendMessage((new Messages.Transaction()).fromBuffer(tx.toBuffer()));
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

    if (pool.numberConnected() >= 2 && !experimentInProgress) {
        experimentInProgress = true;
        doExperiment();
    }
});

// tmp
var localhost = {
    ip: {
        v4: '127.0.0.1'
    },
    port: 8333
};
localhost.hash = pool.hashAddr(localhost);
peerDB.addAddr(localhost);
pool._addAddr(localhost);

// more tmp
var bitcoind01 = {
    ip: {
        v4: '54.154.44.169'
    },
    port: 8333
};
bitcoind01.hash = pool.hashAddr(bitcoind01);
peerDB.addAddr(bitcoind01);
pool._addAddr(bitcoind01);

debug('INIT')('LOCALHOST %s', localhost.hash);
debug('INIT')('BITCOIND01 %s', bitcoind01.hash);

pool.connect();
