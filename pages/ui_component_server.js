"use strict";
(function() {
  var registerPort = function(event) {
    chrome.storage.local.get("vimiumSecret", function(arg) {
      if (!(event.source === window.parent && event.data === arg.vimiumSecret)) {
        return;
      }
      UIComponentServer.portOpen(event.ports[0]);
      window.removeEventListener("message", registerPort);
    });
  };
  window.addEventListener("message", registerPort);
})();

var UIComponentServer = {
  ownerPagePort: null,
  handleMessage: null,
  portOpen: function(ownerPagePort) {
    this.ownerPagePort = ownerPagePort;
    this.ownerPagePort.onmessage = this.onMessage.bind(this);
  },
  onMessage: function(event) {
    if (this.handleMessage) {
      this.handleMessage(event);
    }
  },
  registerHandler: function(handleMessage) {
    this.handleMessage = handleMessage;
  },
  postMessage: function(message) {
    if (this.ownerPagePort) {
      this.ownerPagePort.postMessage(message);
    }
  }
};
