# WebSocket压测工具

## 依赖

### Node.js

下载地址 http://nodejs.org
注意将安装目录下的bin目录加入环境变量中

#### linux下nodejs环境变量

$ touch .bashrc
$ echo 'export PATH=/path/to/nodejs/bin:$PATH' >> .bashrc
$ source .bashrc

#### windows下nodejs环境变量

windows安装版本会自动设置好环境变量

## 使用方法

### linux

```
bin/socketio [options] <url>[@@vip] [<url>[@@vip]...]
```
### windows

```
node bin\socketio [options] <url>[@@vip] [<url>[@@vip]...]
```

### Options

支持虚拟IP
```
  Usage: socketio [options] urls

         urls like
         http://host/socket.io/?transport=websocket
         http://host/socket.io/?transport=websocket@@192.168.102.53

  Options:

    -h, --help                      output usage information
    -A, --amount <connections>      创建连接数, default 10000
    -W, --workers [cpus]            workers to be spawned, default cpus.length
    --TP, --transport [transport]   "polling"/"websocket" default websocket
    --PI, --pingInterval [seconds]  心跳间隔（秒）, default 50
    --SI, --statInterval [seconds]  更新统计信息间隔（秒）, default 60
    --RT, --runtime [seconds]       关闭连接前的超时时间（秒），默认不会超时，需要ctrl+c手动关闭
    -V, --version                   output the version number
```
### Example

保持5k链接5分钟，并发数5k
```
node bin\socketio --amount 5000 --RT 300 "http://14.17.108.68:13092/"
```
```
Thor:                                                  version: 1.2.0

God of Thunder, son of Odin and smasher of WebSockets!

Thou shall:
- Spawn 4 workers.
- Create all the concurrent connections.
- Smash 5000 connections .

Connecting to http://14.17.108.68:13092/

  ◜  Progress :: Created 0, Active 0, @2015-11-11 17:31:15 ==> 此处的统计刷新是statInterval的值，在程序结束之后，此处隐藏

Online               96728 milliseconds
Time taken           96728 milliseconds
Connected            2211
Disconnected         0
Failed               2789
Total transferred    658.86kB
Total received       631.64kB

Durations (ms):

                     min     mean     stddev  median max
Handshaking          171     3354       1631    2915 7737
Latency              NaN     NaN         NaN     NaN NaN

Percentile (ms):

                      50%     66%     75%     80%     90%     95%     98%     98%    100%
Handshaking          2915    3627    4705    4827    5811    6412    7686    7712    7737
Latency              NaN     NaN     NaN     NaN     NaN     NaN     NaN     NaN     NaN

Received errors:

2789x                undefined
```

### License

MIT
