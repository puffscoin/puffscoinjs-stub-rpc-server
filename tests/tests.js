"use strict";

let createStubServer = require("../source/index.js").createStubServer;

let assert = require('chai').assert;
let fetch = require('node-fetch');
let http = require('http');
let net = require('net');
let oboe = require('oboe');
let os = require('os');
let url = require('url');
let WebSocket = require('ws');

function testProtocol(transportType, address) {
  function submitJsonRpc(method, params) {
    assert.typeOf(method, "string");
    assert.instanceOf(params, Array);
    var requestJson = JSON.stringify({ jsonrpc: "2.0", id: 420, method: method, params: params });
    // simple single-use/stateless JSON-RPC submission
    switch (transportType) {
      case "HTTP":
        return fetch(address, { method: 'POST', body: requestJson }).then((response) => response.json());
      case "WS":
        return new Promise((resolve, reject) => {
          let webSocket = new WebSocket(address);
          webSocket.on('open', () => {
            webSocket.send(requestJson);
          });
          webSocket.on('message', (responseJson) => {
            webSocket.close();
            resolve(JSON.parse(responseJson));
          });
        });
      case "IPC":
        return new Promise((resolve, reject) => {
          var socket = net.connect({ path: address });
          socket.on('connect', () => {
            oboe(socket).done((responseJso) => {
              socket.destroy();
              resolve(responseJso);
            });
            socket.write(requestJson);
          });
        });
      default:
        throw new Error("Unsupported transport type: " + transportType);
    }
  }

  var server;
  beforeEach(() => server = createStubServer(transportType, address));
  afterEach((done) => server.destroy(done));

  it("responds to net_version with default", () => {
    var expectedResult = { jsonrpc: "2.0", id: 420, result: "default stub rpc server version" };

    return submitJsonRpc("net_version", []).then((responseJso) => {
      assert.deepEqual(responseJso, expectedResult);
    });
  });

  it("responds to stubbed net_version", () => {
    var expectedResult = { jsonrpc: "2.0", id: 420, result: "apple" };
    server.addResponder((jso) => (jso.method === "net_version") ? "apple" : undefined);

    return submitJsonRpc("net_version", []).then((responseJso) => {
      assert.deepEqual(responseJso, expectedResult);
    });
  });

  it("does not throw when all expectations met", () => {
    server.addExpectation((jso) => jso.method === "net_version");
    return submitJsonRpc("net_version", []).then((responseJso) => {
      assert.doesNotThrow(() => server.assertExpectations());
    });
  });

  it("throws when expectations not met", () => {
    server.addExpectation((jso) => jso.method === "apple");
    return submitJsonRpc("net_version", []).then((responseJso) => {
      assert.throws(() => server.assertExpectations());
    });
  });

  it("adds sent transaction to block when mined", () => {
    let inputTransaction = { from: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" };
    var transactionHash;
    return submitJsonRpc("puffs_sendTransaction", [inputTransaction]).then((responseJso) => {
      transactionHash = responseJso.result;
      assert.match(transactionHash, /^0x[0-9a-zA-Z]{64}$/);
      server.mine();
      return submitJsonRpc("puffs_getTransactionByHash", [transactionHash]);
    }).then((responseJso) => {
      let transaction = responseJso.result;
      assert.match(transaction.blockHash, /^0x[0-9a-zA-Z]{64}$/);
      assert.match(transaction.blockNumber, /^0x[0-9a-zA-Z]+$/);
    });
  });

  it("correctly deals with remote severing connection", () => new Promise((resolve, reject) => {
    var requestJson = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "net_version" });
    switch (transportType) {
      case "HTTP":
        var parsedUrl = url.parse(address);
        var request = http.request({ protocol: parsedUrl.protocol, hostname: parsedUrl.hostname, port: parsedUrl.port, method: "POST" })
        request.write(requestJson);
        request.on("error", () => {});
        request.end();
        server.destroy(() => setTimeout(resolve, 1000));
        break;
      case "WS":
        let webSocket = new WebSocket(address);
        webSocket.on('open', () => {
          webSocket.send(requestJson, () => server.destroy(resolve));
        });
        break;
      case "IPC":
        var socket = net.connect({ path: address });
        socket.on('connect', () => {
          socket.write(requestJson, undefined, () => server.destroy(resolve));
        });
        break;
      default:
        throw new Error("Unsupported transport type: " + transportType);
    }
  }));
};

describe("HTTP", () => testProtocol("HTTP", "http://localhost:1337"));
describe("WS", () => testProtocol("WS", "ws://localhost:1337"));
describe("IPC", () => testProtocol("IPC", (os.type() === "Windows_NT") ? "\\\\.\\pipe\\TestRPC" : "testrpc.ipc"));
