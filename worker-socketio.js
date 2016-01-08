'use strict';

var Socket = require('socket.io-client')
  , connections = {}
  , concurrent = 0
  , tasks = {};

//
// Get the session document that is used to generate the data.
//
var session = require(process.argv[2]);

//
// WebSocket connection details.
//
var masked = process.argv[4] === 'true'
  , binary = process.argv[5] === 'true'
  , protocol = +process.argv[3] || 13;

// collect metics datas
var metrics_datas = {collection:true, wid: process.pid, concurrent: 0, datas:[], tmpdatas:[]}
  , metrics_datas_sigleton = metrics_datas
  , statInterval = +process.argv[6] || 60
  , logError = +process.argv[7] || 0
  , process_sending = false
  /**
   * SEND or collect a message which to be send to master
   * @param  {object} data {type:message-type, id:task-id, ...}
   * @param  {object} task message from master for creating a socket connection
   */
  , process_send = function(data, task) {
      // immediate statistic or run callback on open
      if (statInterval <= 0 || ('open' == data.type && task.nextTask)) {
        // lower ipc counter
        if(!process_sending){
          process_sending = true;
          
          metrics_datas_sigleton.datas = [data];
          metrics_datas_sigleton.concurrent = concurrent;
          process.send(data, null, function sended(err){
            if (err) {
              process_sending = false;
              return;
            }

            process_sending = false;
          });
        }
      }else{
        // datas should be push into temporary array while worker sending data to master
        if (process_sending) {
          metrics_datas.tmpdatas.push(data);
        }else{
          metrics_datas.datas.push(data);
        }
      }
    }
  /**
   * send all collected messages to master
   * @param  {boolean} end exist worker or not
   */
  , process_sendAll = function(end) {
      if (metrics_datas.datas.length <= 0) {
        process_exit(end);
        return;
      }
      // lower ipc counter
      if(!process_sending){
        metrics_datas.datas = metrics_datas.datas.concat(metrics_datas.tmpdatas);
        metrics_datas.tmpdatas = [];
        metrics_datas.concurrent = concurrent;
        process_sending = true;

        // send all data to parent
        process.send(metrics_datas, null, function clearDatas(err){
          // invoked after the message is sent but before the target may have received it
          if (err) {
            process_sending = false;
            process_exit(end);
            return;
          }
          metrics_datas.datas = [];
          process_sending = false;

          // WARNING: maybe we should use synchronize method here
          process_exit(end);
        });
      }else{
        process_exit(end);
      }
    }
  , process_exit = function(exit){
    if (exit) {
        process.exit();
    }
  }
  /**
   * check connections length in this worker, and send all messages to master then exit this worker if length negative
   */
  , checkConnectionLength = function(){
      if (Object.keys(connections).length <= 0) {
        process_sendAll(true);
      }
    }
  /**
   * send all message to master circularly
   */
  , workerStatInterval = statInterval <= 0 ? null : setInterval(function () {
      process_sendAll();
    }, statInterval * 1000)
  /**
   * close a socket connection and send message to master, exit worker if connection's length negative
   * @param  {Socket} socket 
   * @param  {object} task   message from master for creating a socket connection
   * @param  {mixed} msg    message from emitter for closing socket
   */
  , socketClose = function (socket, task, msg) {
    // close once only
    if (!connections[task.id]) {
      return;
    }

    --concurrent;
    var err_pos = 3
      , err = msg=='error' && arguments.length > err_pos ? Array.prototype.slice.call(arguments, err_pos, err_pos + 1).pop() : null;
    if (err && logError) {
      console.error(err);
    }

    var internal = {};
    try{
      internal = socket.io.engine.transport.ws._socket || {};
    }catch(e){
      // console.info(socket.io.engine.transport.pollXhr);
    }

    process_send({
      type: 'close', id: task.id,
      read: internal.bytesRead || 0,
      send: internal.bytesWritten || 0
    }, task);

    delete connections[task.id];
    checkConnectionLength();
  }
  /**
   * parse socket.io error object/data and return string message
   * @param  {object} err Error object/data
   * @return {string}     error message
   */
  , socketErrorMessage = function(err){
    return err.description ? (err.description.message?err.description.message:err.description) : (err.message?err.message:err);
  }
  /**
   * handle socket error event and then close
   * @param  {Socket} socket 
   * @param  {object} task   message from master for creating a socket connection
   * @param  {Error} err    Error object/data from emitter
   */
  , socketError = function (socket, task, err) {
    process_send({ type: 'error', message: socketErrorMessage(err), id: task.id }, task);

    socketClose(socket, task, 'error', err);
  }
  ;

/**
 * message from master
 */
process.on('message', function message(task) {
  var start_timestamp = Date.now();

  //
  // Write a new message to the socket. The message should have a size of x
  //
  if ('write' in task) {
    Object.keys(connections).forEach(function write(id) {
      write(connections[id], task, id);
    });
  }

  //
  // Shut down every single socket.
  //
  if (task.shutdown) {
    Object.keys(connections).forEach(function shutdown(id) {
      connections[id] && socketClose(connections[id], tasks[id]);
    });
  }

  // End of the line, we are gonna start generating new connections.
  if (!task.url) return;

  /**
   * create a socket connection
   * @type {Socket}
   */
  var socket = new Socket(task.url, {
    'force new connection': true,
    reconnection: false,
    timeout: task.connectTimeout * 1000,
    transports: task.transport,
    protocolVersion: protocol,
    localAddress: task.localaddr || null,
    headers: {'user-agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.93 Safari/537.36'}
  });
  socket.last = Date.now();

  /**
   * listen to connected event
   */
  socket.on('connect', function open() {
    process_send({ type: 'open', duration: Date.now() - start_timestamp, id: task.id }, task);
    // server will not able to parse the msg format
    // write(socket, task, task.id);

    // As the `close` event is fired after the internal `_socket` is cleaned up
    // we need to do some hacky shit in order to tack the bytes send.
  });

  /**
   * listen to server message event
   */
  socket.on(process.env.NODE_ON_MESSAGE?process.env.NODE_ON_MESSAGE:'message', function message(data) {
    process_send({
      type: 'message', latency: Date.now() - socket.last,
      id: task.id
    }, task);

    // Only write as long as we are allowed to send messages
    if (--task.messages) {
      write(socket, task, task.id);
    } else {
      socketClose(socket, task);
    }
  });

  /**
   * listen to disconnecting event
   */
  socket.on('disconnect', function close(msg){
    socketClose(socket, task, msg);
  });

  /**
   * listen to socket error event
   */
  socket.on('error', function error(err){
    socketError(socket, task, err);
  });

  /**
   * catch ECONNREFUSED & connect_timeout
   */
  socket.on('connect_error', function connect_error(err){
    socketError(socket, task, err);
  });

  // Adding a new socket to our socket collection.
  ++concurrent;
  connections[task.id] = socket;
  tasks[task.id] = task;

  // timeout to close socket
  if (task.runtime && task.runtime > 0) {
    setTimeout(function timeoutToCloseSocket(id, socket) {
      socketClose(socket, task);
    }, task.runtime * 1000, task.id, socket);
  }
});

process.on('SIGINT', function () {
});
process.on('exit', function () {
});

/**
 * Helper function from writing messages to the socket.
 *
 * @param {WebSocket} socket WebSocket connection we should write to
 * @param {Object} task The given task
 * @param {String} id
 * @param {Function} fn The callback
 * @param {String} data
 * @api private
 */
function write(socket, task, id, fn, data) {
  // i thank the generator doesn't make any sense, but just let me do some change and leave it alone
  session[binary ? 'binary' : 'utf8'](data || task.size, function message(err, data) {
    var start = socket.last = Date.now();

    socket.send(data, {
      binary: binary,
      mask: masked
    }, function sending(err) {
      if (err) {
        socketError(socket, task, err);
      }

      if (fn) fn(err);
    });
  });
}
