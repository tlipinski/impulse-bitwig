
function BitwigController() {
  var controller = this;

  this.defaultTemplateTitle = 'Bitwig';
  this.sysexHeader = 'F0 00 20 29 67';
  this.tracksPerPage = 8;
  this.trackBankPage = 0;
  this.tracks = [{}, {}, {}, {}, {}, {}, {}, {}];
  this.master = {};

  // Device state values.
  this.shiftPressed = false;
  this.loopPressed = false;
  this.forwardPressed = false;
  this.rewindPressed = false;
  this.rotaryState = 'plugin';
  this.mixerPage = 0;
  this.mixerPages = ['Mixer', 'Pan', 'Send', 'Record', 'Solo', 'Mute'];
  this.dawMode = false;
  this.faderButtonMode = 'mute';

  this.pad1Pressed = false;
  this.pad2Pressed = false;
  this.pad3Pressed = false;
  this.pad4Pressed = false;
  this.pad5Pressed = false;
  this.pad6Pressed = false;
  this.pad7Pressed = false;
  this.pad8Pressed = false;

  this.midiRotary1Value = 0;
  this.midiRotary2Value = 0;
  this.midiRotary3Value = 0;
  this.midiRotary4Value = 0;
  this.midiRotary5Value = 0;
  this.midiRotary6Value = 0;
  this.midiRotary7Value = 0;
  this.midiRotary8Value = 0;

  this.mutes = [];
  this.solos = [];

  // TODO documentation
  this.defaultVelocityTranslationTable = [];
  this.silentVelocityTranslationTable = [];
  for (var i=0;i<128;i++) {
    this.defaultVelocityTranslationTable.push(i);
    this.silentVelocityTranslationTable.push(0);
  }

  this.device = {
    vendor:           'Novation',
    name:             'Impulse 49',
    version:          '1.1',
    uuid:             '3B1F8670-2433-11E2-81C1-0800200C9A66',
    numMidiOutPorts:  2,
    numMidiInPorts:   1 
  };


  // These are all hardcoded CC values that can't be modified on the impulse.
  // All settings that *can* be modified are set in the template (Impulse.template.js).

  this.faders = {
    channel:        49,
    master:         8
  };

  this.buttons = {
    midi:           8,
    mixer:          9,
    plugin:         10,
    pageUp:         11,
    pageDown:       12,
    rewind:         27,
    forward:        28,
    stop:           29,
    play:           30,
    loop:           31,
    record:         32,
    midiMode:       33,
    mixerMode:      34,
    bankUp:         35,
    bankDown:       36,
    nextTrack:      37,
    prevTrack:      38,
    shift:          39
  };

  this.clips = {
    clip1:          60,
    clip2:          61,
    clip3:          62,
    clip4:          63,
    clip5:          64,
    clip6:          65,
    clip7:          66,
    clip8:          67
  };

  this.midiIns = [];
  this.noteInputs = [];

  this.init = function() {
    this.template = new ImpulseTemplate({
      title: this.defaultTemplateTitle
    });
    this.events = new ImpulseEvents(this.template, this);

    var midiCallback = function(status, data1, data2) {
      controller.events.onMidi.call(controller.events, status, data1, data2);
    };

    var sysexCallback = function(data) {
      controller.events.onSysex.call(controller.events, data);
    };

    // Map all device midi out ports to host in ports.
    for (var i=0;i<impulse25.device.numMidiOutPorts;i++) {
      this.midiIns[i] = host.getMidiInPort(i);
      this.midiIns[i].setMidiCallback(midiCallback);
      this.midiIns[i].setSysexCallback(sysexCallback);
    }

    this.createNoteInputs();

    // Send host midi clock to device in ports.
    for (i=0;i<impulse25.device.numMidiInPorts;i++) {
      host.getMidiOutPort(i).setShouldSendMidiBeatClock(true);
    }

    this.sysexHeader = 'F0 00 20 29 67';
    sendSysex(this.sysexHeader + ' 06 01 01 01 F7');




    this.test = function(i) {
      //var m = 'F0 00 20 29 43 00 00' + uint8ToHex(i) + controller.msg + 'F7';
      //sendSysex(m);
      sendMidi(0xb1, 0x39, i);
      println(i);
      i++;

      if (i<128) {
        host.scheduleTask(controller.test, [i], 100);
      }
    };

    //host.scheduleTask(this.test, [0], 2000);
    //return;


    this.cursorTrack = host.createArrangerCursorTrack(this.tracksPerPage, 0);
    this.cursorDevice = host.createEditorCursorDevice();
    this.browser = this.cursorDevice.createDeviceBrowser(5, 7);
    this.trackBank = host.createTrackBank(this.tracksPerPage, 0, 0); // numTracks, numSends, numScenes
    this.mainTrack = host.createMasterTrack(0);
    this.transport = host.createTransport();
    this.application = host.createApplication();

    this.trackBank.addChannelCountObserver(function(count) {
        controller.trackBankSize = count;
    });

    /*
    var actions = this.application.getActions();
    for (var property in actions) {
      println(property + ': ' + actions[property].getId() + ': ' + actions[property].getName());
    }
    */

    this.events.handleShiftPress(false); // Init the default shift state.

    sendMidi(0xb1, this.buttons.plugin, 0x0); // Initialize the impulse on the device page.

    // Both of these observer are *not* documented :)
    this.cursorTrack.addNameObserver(16, "", function(text) {
      controller.templateTitle = text;
      controller.currentTrackName = text;
      host.showPopupNotification(text);
      controller.displayText(text);
    });

    this.cursorTrack.addPositionObserver(function(index) {
      controller.activeTrack = parseInt(index, 10);
//      controller.scrollToTrackBankPage();
    });

    this.cursorDevice.addNameObserver(20, 'none', function(name) {
      host.showPopupNotification(name);

    });

    for (var i=0;i<this.tracksPerPage;i++) {
      track = this.trackBank.getChannel(i);
      track.addPositionObserver(function(i) {
        return function(value) {
          controller.tracks[i].position = value;
        }
      }(i));
    }

    for (var i=0;i<this.tracksPerPage;i++) {
      track = this.trackBank.getChannel(i);
      track.addTrackTypeObserver(10, "Empty", function(i) {

        return function(value) {
          var el = controller.tracks[i] || {};
          controller.tracks[i].type = value;
          controller.printTracks();
          controller.refreshFaderButtons();
        }
      }(i));
    }

    for (var i=0;i<this.tracksPerPage;i++) {
      track = this.trackBank.getChannel(i);
      track.getMute().addValueObserver(function(i) {
        return function(value) {
          controller.tracks[i].mute = value;
          controller.refreshFaderButtons();
        }
      }(i));
    }

    this.mainTrack.getMute().addValueObserver(function(value) {
      controller.master.mute = value;
      controller.refreshFaderButtons();
    });

    for (var i=0;i<this.tracksPerPage;i++) {
      track = this.trackBank.getChannel(i);
      track.getSolo().addValueObserver(function(i) {
        return function(value) {
          controller.tracks[i].solo = value;
          controller.refreshFaderButtons();
        }
      }(i));
    }

    this.mainTrack.getSolo().addValueObserver(function(value) {
      controller.master.solo = value;
      controller.refreshFaderButtons();
    });

    for (var i=0;i<this.tracksPerPage;i++) {
      track = this.trackBank.getChannel(i);
      track.addNameObserver(10, "-", function(i) {
        return function(value) {
          controller.tracks[i].name = value;
        }
      }(i));
    }

    this.notifications = host.getNotificationSettings();

    this.notifications.setShouldShowChannelSelectionNotifications(true);
    this.notifications.setShouldShowDeviceLayerSelectionNotifications(true);
    this.notifications.setShouldShowDeviceSelectionNotifications(true);
    this.notifications.setShouldShowMappingNotifications(true);
    this.notifications.setShouldShowPresetNotifications(true);
    this.notifications.setShouldShowSelectionNotifications(true);
    this.notifications.setShouldShowTrackSelectionNotifications(true);
    this.notifications.setShouldShowValueNotifications(true);
  };

  this.printTracks = function() {
//    return;
    println("---")
    println("master: (" +
        (controller.master.mute ? 'M' : '') +
        (controller.master.solo ? 'S' : '') + ")")
    for (var i = 0; i < this.tracksPerPage; i++) {
      var track = controller.tracks[i];
      println(
        "track: " + (i + 1) + ", " +
        "name: " + track.name + ", " +
        "type: " + track.type + ", " +
        "pos: " + track.position + ", (" +
        (track.mute ? 'M' : '') +
        (track.solo ? 'S' : '') + ")")
    }
  }

  this.highlightModifyableTracks = function() {
    var track, send;

    for (var i=0;i<this.tracksPerPage;i++) {
      track = this.trackBank.getChannel(i);
      if (track && track.exists()) {
        track.getVolume().setIndication('mixer' == this.rotaryState && this.mixerPage === 0);
        track.getPan().setIndication('mixer' == this.rotaryState && this.mixerPage === 1);
        send = track.getSend(0);
        if (send) {
          send.setIndication('mixer' == this.rotaryState && this.mixerPage === 2);
        }
      }
    }
  };

  this.moveTransport = function(amount) {
    this.transport.incPosition(amount, false);

    if ((amount > 0 && this.forwardPressed) || (amount < 0 && this.rewindPressed)) {
      host.scheduleTask(function(amount) {
        controller.moveTransport.call(controller, amount);
      }, [amount], 5);
    }
  };

  this.displayText = function(text, delay) {
    delay = delay || 0;
    host.scheduleTask(function(text) {
      var message = controller.sysexHeader +  '08 ' + text.forceLength(8).toHex(8) +' F7';
      sendSysex(message);
    }, [text], delay);
  };

  this.scrollToTrackBankPage = function(page) {
    if ('undefined' == typeof page) {
      // Reset the mixer page to the one of the currently selected track.
      page = Math.floor(this.activeTrack / this.tracksPerPage);
    }
    if (page != this.trackBankPage) {
      var diff = this.trackBankPage - page;
      for (var i=0;i<Math.abs(diff);i++) {
        // Honestly, I don't understand why we need to scroll a page up but
        // decrease the trackBankPage value.
        // But otherwise the indicators for the selected trackbank went into the
        // wrong direction :)
        if (diff > 0) {
          this.trackBank.scrollTracksPageUp();
          this.trackBankPage--;
        }
        else {
          this.trackBankPage++;
          this.trackBank.scrollTracksPageDown();
        }
      }
      this.highlightModifyableTracks();
    }
  };

  this.createNoteInputs = function() {
    for (var i=0;i<this.device.numMidiOutPorts;i++) {
      // Set up note input to ignore the last midi channel.
      this.noteInputs[i] = this.midiIns[i].createNoteInput('Impulse keyboard ' + i);


      // For some reason, when creating a note input the rotary 2 would stop working
      // because the midi event gets handled/consumed as note input and does not
      // call our this.onMidiEvent.
      // We work around this by telling bitwig, that the note inputs should not
      // consume the midi events, which means that all midi events get passed along
      // to our midi callbacks.
      this.noteInputs[i].setShouldConsumeEvents(false);
    }
  };

  this.setVelocityTranslationTable = function(table) {
    for (var i=0;i<this.noteInputs.length;i++) {
      this.noteInputs[i].setVelocityTranslationTable(table);
    }
  };

  this.setDefaultVelocityTranslationTable = function() {
    this.setVelocityTranslationTable(this.defaultVelocityTranslationTable);
  };

  this.setSilentVelocityTranslationTable = function() {
    this.setVelocityTranslationTable(this.silentVelocityTranslationTable);
  };

  this.sendMidiToBitwig = function(status, data1, data2) {
    for (var i=0,len=this.noteInputs.length;i<len;i++) {
      this.noteInputs[i].sendRawMidiEvent(status, data1, data2);
    }
  };

  this.setPluginIndications = function(value) {
    for (var i=0;i<8;i++) {
      this.cursorTrack.getPrimaryInstrument().getMacro(i).getAmount().setIndication(value);
      this.cursorDevice.getParameter(i).setIndication(value && this.shiftPressed);
    }
  };

  this.trackType = function(track) {
    return controller.tracks[track].type;
  }

  this.refreshFaderButtons = function() {
    if (controller.faderButtonMode == 'mute') {
      sendMidi(0xb0, 17, controller.master.mute ? 0 : 1);

      for (var i = 0; i < controller.tracksPerPage; i++) {
        var type = controller.trackType(i);
        switch(type) {
          case 'Master':
          case 'Empty':
            sendMidi(0xb0, 9 + i, 0);
            break;

          default:
            sendMidi(0xb0, 9 + i, controller.tracks[i].mute ? 0 : 1);
            break;
        }
      }
    }
    if (controller.faderButtonMode == 'solo') {
      sendMidi(0xb0, 17, controller.master.solo ? 1 : 0);

      for (var i = 0; i < controller.tracksPerPage; i++) {
        var type = controller.trackType(i);
        switch(type) {
          case 'Master':
          case 'Empty':
            sendMidi(0xb0, 9 + i, 0);
            break;

          default:
            sendMidi(0xb0, 9 + i, controller.tracks[i].solo ? 1 : 0);
            break;
        }
      }
    }
  };

  this.faderButtonModeChange = function(mode) {
    controller.faderButtonMode = mode;
    controller.refreshFaderButtons();
    controller.printTracks();
  };
}
