# WOL Proxy

Very simple script that proxy TCP traffic to given machine. If the machine is down it sends wake-on-lan packet to turn it on.

## Example
```js

const WOLProxy = require('wake-on-lan-proxy');

(new WOLProxy())
    .source(9000)
    .target({
        port: 80,
        host: '192.168.0.10',
        mac: '<address mac of target machine>'
    })
    .run();
```

## Debugging
```js
DEBUG=* node script.js
```