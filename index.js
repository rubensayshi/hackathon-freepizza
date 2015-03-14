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
var sha256 = bitcore.crypto.Hash.sha256;
var client = blocktrail.BlocktrailSDK({
    apiKey : "MY_APIKEY",
    apiSecret : "MY_APISECRET"
});

var Pool = require('lib/pool');
var PeerDB = require('lib/db/peer');
var ExperimentDB = require('lib/db/experiment');

var hdPrivKey = new HDPrivateKey("xprv9s21ZrQH143K35hXpQfuktrDZnjaVm7DsbmNba6DkTY8BGsmcjiuWpdAC6AoU2jttzTb44n7MyXhyuHCpychuXXHhfgGMPt9wbLBPopwGsA");

var sourcePrivKey = hdPrivKey.derive(0).privateKey;

debug("INIT")("SOURCE ADDRESS [%s]", sourcePrivKey.toAddress());

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

var ichunks = 10;

var pool = new Pool(Networks.livenet, {
    maxSize: ichunks,
    listenAddr: true,
    dnsSeed: true
});

var txDB = {};

function buildExperimentTxs(ichunks, cb) {
    client.addressUnspentOutputs(sourcePrivKey.toAddress(), function(err, result) {
        if (err) return cb(err);

        var utxo = result.data[0];
        var value = _.random(10000, 20000);

        debug('EXPERIMENT')('SPENDING %d satoshi of %s %d', value, utxo.hash, utxo.index);

        var txs = {};

        for (var i = 0; i < ichunks; i++) {
            txs[i] = (new Transaction())
                .from({
                    txId: utxo.hash,
                    outputIndex: utxo.index,
                    satoshis: utxo.value,
                    script: utxo.script_hex
                })
                .to(hdPrivKey.derive(i + 1).privateKey.toAddress(), value)
                .change(sourcePrivKey.toAddress())
                .sign([sourcePrivKey]);
        }

        cb(null, txs);
    });
};

function doExperiment() {
    buildExperimentTxs(ichunks, function(err, txs) {
        var chunks = {};

        async.forEach(Object.keys(pool._connectedPeers), function(hash, cb) {
            var peer = pool._connectedPeers[hash];

            if (!peer) {
                return cb(new Error("NO MORE PEER"));
            }

            var addr = {ip: {v4: peer.host}, port: peer.port};
            addr.hash = sha256(new Buffer((addr.ip.v6 || addr.ip.v4) + addr.port)).toString('hex');

            peerDB.addAddr(addr, function(err) {
                if (err) return cb(err);

                peerDB.peerID(peer, function(err, peerID) {
                    if (err || !peerID) return cb(err || new Error("No peerID"));

                    var ichunk = peerID % ichunks;

                    if (!chunks[ichunk]) {
                        chunks[ichunk] = [];
                    }

                    chunks[ichunk].push(peer);

                    cb();
                });
            });
        }, function(err, res) {
            if (err) throw err;

            debug('EXPERIMENT')('CHUNKS %o', chunks);

            _.forEach(Object.keys(chunks), function(ichunk) {
                var chunk = chunks[ichunk];
                var tx = txs[ichunk];
                txDB[tx.hash] = tx;

                debug('EXPERIMENT')('CHUNK %d - TX %s - %d peers', ichunk, tx.hash, chunks[ichunk].length);
            });

            experimentDB.createExperiment(chunks, txs, function(err, experimentID) {
                if (err) throw err;

                debug('EXPERIMENT')('EID %d', experimentID);

                async.forEach(Object.keys(chunks), function(ichunk, cb) {
                    var chunk = chunks[ichunk];
                    var tx = txs[ichunk];

                    var txInv = [{
                        type: Messages.Inventory.TYPE.TX,
                        hash: new Buffer(tx.hash, 'hex')
                    }];

                    var txMessage = new Messages.Inventory(txInv);

                    async.forEach(chunk, function(peer, cb) {
                        debug('EXPERIMENT')('INV%d %s %o', ichunk, peer.host, txMessage);
                        peer.sendMessage(txMessage);
                        cb();
                    }, cb);
                }, function(err, res) {
                    debug('EXPERIMENT')('INIT DONE %o %o', err, res);

                    setTimeout(function() {
                        async.forEach(Object.keys(chunks), function(ichunk, cb) {
                            var chunk = chunks[ichunk];
                            var tx = txs[ichunk];

                            client.transaction(tx.hash, function(err, res) {
                                if (!err) {
                                    debug('EXPERIMENT')('RESULT! %d', ichunk);
                                }
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

    debug('SEED')('%o', ips);
    _.forEach(ips, function(ip) {
        var addr = {ip: {v4: ip}};
        addr.hash = self.hashAddr(addr);

        debug('SEED')('ADDR %o', addr);
        // peerDB.addAddr(addr); // missing port :/
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

    var addr = {ip: {v4: peer.host}, port: peer.port};
    addr.hash = sha256(new Buffer((addr.ip.v6 || addr.ip.v4) + addr.port)).toString('hex');
    peerDB.addAddr(addr, function(err) {
        if (err) throw err;
        if (pool.numberConnected() >= ichunks && !experimentInProgress) {
            experimentInProgress = true;
            doExperiment();
        }
    });
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
