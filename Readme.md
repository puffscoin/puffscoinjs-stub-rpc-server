

# Purpose

Allow for easy "stubbing" of a PUFFScoin node when testing PUFFScoin dApp clients.  It allows you to stub out a response to any request with whatever result you like so it is easy to write tests for dApps without having to run a full PUFFScoin node or have the contract mined.  It is intended to be run inside your tests and a new server should be created/destroyed with each test case, though you could re-use across test cases if you are okay with using the same responses in each test.

This library is not intended to simulate the inner workings of a real PUFFScoin node, only allow you to define canned responses to requests made of an Ethereum node.  It supports requests over HTTP, WS or IPC.  It dose have some basic simulation build in (can be overriden or removed) for things like `puffs_sendTransaction`, `puffs_getBlock`, `net_version` (and others) and it has a `.mine()` function to allow you to simulate mining a block that includes pending transactions.  PRs welcome for additional baked-in behaviors, though the goal is to keep them relatively simply with a focus on validating request payloads and returning responses that are shaped correctly.

# Usage

```javascript
describe("my PUFFScoin integration test", () => {
	var server;
	beforeEach(function () {
		server = require('puffscoinjs-stub-rpc-server').createStubServer('HTTP', 'http://localhost:11363');
	});
	afterEach(function () {
		server.destroy();
	});

	it("uses a stub server", () => {
		server.addExpectation((requestJso) => requestJso.method === "net_version");
		server.addResponder((requestJso) => (requestJso.method === "net_version") ? "apple" : undefined);
		myPreferredPuffscoinJsLibrary.netVersion().then((version) => {
			assert.strictEqual(version, "apple");
			server.assertExpectations();
		});
	});
});
```

To see the public surface area of this project in TypeScript definition format plus JSDocs (which a TypeScript aware editor will understand) check out [source/index.d.ts](source/index.d.ts).  You can also see the tests for more full featured examples (in particular, see `adds sent transaction to block when mined` for an interesting one that does mining).
