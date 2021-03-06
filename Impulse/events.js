function ImpulseEvents(template, controller) {
  var buttons, faders;
  this.encoderAsButtonStatus = {};

  this.getEventType = function(status, data1, data2) {
    if (0xb1 == status && data1 >= 0 && data1 <= 7) {
      // In plugin or mixer mode.
      return 'rotary';
    }
    else if (isChannelController(status)) {
      // TODO: Add fader codes for 49 and 61 key versions.
      if (0 === MIDIChannel(status) && (data1 == faders.channel || (0 <= data1 && data1 <= 8))) {
        return 'fader';
      }
      else if (0 === MIDIChannel(status) && 9 <= data1 && data1 <= 17) {
        return 'mute-solo';
      }
      else if (data1 == 34) {
        return 'muteSoloToggle';
      }
      else if (
        data1 == buttons.play ||
        data1 == buttons.stop ||
        data1 == buttons.record ||
        data1 == buttons.rewind ||
        data1 == buttons.forward ||
        data1 == buttons.loop ||
        data1 == buttons.pageUp ||
        data1 == buttons.pageDown ||
        data1 == buttons.mixer ||
        data1 == buttons.plugin ||
        data1 == buttons.midi ||
        data1 == buttons.nextTrack ||
        data1 == buttons.prevTrack ||
        data1 == buttons.bankUp ||
        data1 == buttons.bankDown ||
        data1 == buttons.midiMode ||
        data1 == buttons.mixerMode ||
        data1 == buttons.shift) {
        return 'button';
      }
      else if (
        // TODO: Update event type detection to be able to handle all possible
        //       template settings for rotaries.
        data1 == template.data.rotary1Note.hexByteAt(0) ||
        data1 == template.data.rotary2Note.hexByteAt(0) ||
        data1 == template.data.rotary3Note.hexByteAt(0) ||
        data1 == template.data.rotary4Note.hexByteAt(0) ||
        data1 == template.data.rotary5Note.hexByteAt(0) ||
        data1 == template.data.rotary6Note.hexByteAt(0) ||
        data1 == template.data.rotary7Note.hexByteAt(0) ||
        data1 == template.data.rotary8Note.hexByteAt(0)) {
          return 'rotary';
      }
      else if (
        // TODO: Update event type detection to be able to handle all possible
        //       template settings for rotaries.
        data1 == template.data.pad1Note.hexByteAt(0) ||
        data1 == template.data.pad2Note.hexByteAt(0) ||
        data1 == template.data.pad3Note.hexByteAt(0) ||
        data1 == template.data.pad4Note.hexByteAt(0) ||
        data1 == template.data.pad5Note.hexByteAt(0) ||
        data1 == template.data.pad6Note.hexByteAt(0) ||
        data1 == template.data.pad7Note.hexByteAt(0) ||
        data1 == template.data.pad8Note.hexByteAt(0)) {
          return 'pad';
      }
    } 

    return 'unknown';
  };

  this.handleFaderChange = function(status, data1, data2) {
    var target;

    var faderIdx = data1;

    if ('mixer' == controller.rotaryState || controller.shiftPressed) {
      target = controller.mainTrack;
    }
    else if (data1 == faders.master) {
      target = controller.mainTrack;
    }
    else {
      var type = controller.trackType(faderIdx);
      if (type != 'Master') {
        target = controller.trackBank.getChannel(data1);
      }
    }
    target && target.getVolume().set(data2, 128);
  };

  this.handleMuteChange = function(status, data1, data2) {
    if (data2 == 1) {
      var buttonIdx = data1 - 9;
      if (buttonIdx == 8) {
        controller.mainTrack.getMute().toggle();
        return;
      }
      var type = controller.trackType(buttonIdx);
      if (type != 'Master') {
        controller.trackBank.getChannel(buttonIdx).getMute().toggle();
      }
    }
  };

  this.handleSoloChange = function(status, data1, data2) {
    if (data2 == 1) {
      var buttonIdx = data1 - 9;
      if (buttonIdx == 8) {
        controller.mainTrack.getSolo().toggle();
        return;
      }
      var type = controller.trackType(buttonIdx);
      if (type != 'Master') {
        controller.trackBank.getChannel(buttonIdx).getSolo().toggle();
      }
    }
  };

  this.handleRotaryChange = function(status, data1, data2) {
    switch (controller.rotaryState) {
      case 'plugin':
        this.handlePluginRotaryChange(status, data1, data2);
        break;

      case 'mixer':
        this.handleMixerRotaryChange(status, data1, data2);
        break;

      case 'midi':
        this.handleMidiRotarychange(status, data1, data2);
        break;
    }
  };

  this.handlePluginRotaryChange = function(status, data1, data2) {
    // Data1 is 0-7, so we can use it directly as index.
    var target;

    if (controller.dawMode) {
      // If in daw mode we use the encoders as buttons in plugin state because
      // they send up and down CC codes instead of absolute values.

      switch (data1) {
        case 0:
          // Focus different panels of Bitwig.
          this.handleEncoderAsButton(status, data1, data2, function(status, data1, data2) {
            var movedLeft = 0x3F == data2; // 0x3F == left/down, 0x41 == right/up
            var action = 'Focus ' + (movedLeft ? 'previous' : 'next') + ' panel'; 
            controller.application.getAction(action).invoke();
          });
          break;

        case 6:
          // Generic arrow left / right
          this.handleEncoderAsButton(status, data1, data2, function(direction) {
            if (direction < 0) {
              controller.application.arrowKeyLeft();
            }
            else {
              controller.application.arrowKeyRight();
            }
          }, 3);
          break;

        case 7:
          // Generic arrow up /down
          this.handleEncoderAsButton(status, data1, data2, function(direction) {
            if (direction < 0) {
              controller.application.arrowKeyDown();
            }
            else {
              controller.application.arrowKeyUp();
            }
          }, 3);
          break;
      }

    }
    else {
      // The regular plugin state.
      if (controller.shiftPressed) {
        // We default to modifying macro values, and only modify plugin values
        // directly if shift is pressed.
        target = controller.cursorDevice.getParameter(data1);
      }
      else {
        target = controller.cursorTrack.getPrimaryInstrument().getMacro(data1).getAmount();
      }

      var delta = data2 - 64; // +/- 1 depending on direction
      target.inc(delta, 100); // The second parameter is the full range.
    }
  };

  this.handleEncoderAsButton = function(status, data1, data2, actionCallback, threshold) {
    threshold = threshold || 4;
    var direction = data2 - 0x40; // Depending on the speed of change this gets us +-1 for regular and up to -+4/5 for fast changes.

    if ('undefined' == typeof this.encoderAsButtonStatus[data1 + '-' + status]) {
      this.encoderAsButtonStatus[data1 + '-' + status] = direction;
    }
    else if (this.encoderAsButtonStatus[data1 + '-' + status] < 0 && direction > 0 || this.encoderAsButtonStatus[data1 + '-' + status] > 0 && direction < 0) {
      // Reset the status if the direction changed.
      this.encoderAsButtonStatus[data1 + '-' + status] = direction;
    }
    else {
      this.encoderAsButtonStatus[data1 + '-' + status] += direction;
    }

    if (Math.abs(this.encoderAsButtonStatus[data1 + '-' + status]) > threshold) {
      delete this.encoderAsButtonStatus[data1 + '-' + status];
      actionCallback.call(this, direction);
    }
  };

  this.handleMixerRotaryChange = function(status, data1, data2) {
    // Data1 is 0-7, so we can use it as index in combination with the mixer page.
    var track = controller.trackBank.getChannel(data1), target, delta;
    if (!track || !track.exists()) {
      return;
    }
    delta = data2 - 64;

    switch (controller.mixerPages[controller.mixerPage]) {
      case 'Pan':
        track.getPan().inc(delta, 100);
        break;

      case 'Send':
        target = track.getSend(0);
        if (target) {
          target.inc(delta, 100);
        }
        break;

      case 'Record':
        track.arm.set(delta > 0);
        break;
    }
  };

  this.handleMidiRotarychange = function (status, data1, data2) {

    var target, delta;
    var parameterIndex = data1 - 50;
    // Data1 is 71-78, so we subtract 71 to get 0-7.

    if (7 == parameterIndex) {
      // The last rotary does zooming.
      delta = data2 - controller.midiRotary8Value;
      controller.midiRotary8Value += delta;
      if (delta > 0) {
        controller.application.zoomIn();
      }
      else {
        controller.application.zoomOut();
      }
      host.scheduleTask(function() {
        controller.moveTransport.call(controller, 0.00001);
      }, [], 0);
    }

    // For plugin mode data1 is 0-7, but when in rotary state midi it's 21-28.
    // So we need to subtract 21 to get the correct index.
    // !!! NOTE: Suddenly this is not 21 but 71 and I don't know yet what caused the change

    // When in rotary state midi, data2 is an absolute midi value, so we
    // need to set it instead of incresing.
    // The set method (like the inc method) expects a range parameter.
    // This must be 128 because data2 is an absolute midi value (0-127) so it has 128 values.
    //target.set(data2, 128);
  };

  this.handleButtonPress = function(status, button, value) {

    switch (button) {

      case buttons.midiMode:
        // We (ab)use the midi mode as daw/edit mode.
        controller.dawMode = true;
        this.handleShiftPress(false);
        break;

      case buttons.mixerMode:
        controller.dawMode = false;
        this.handleShiftPress(false);
        break;

      case buttons.shift:
        this.handleShiftPress(value);
        break;

      case buttons.plugin:
        controller.rotaryState = 'plugin';
        controller.displayText(controller.templateTitle);
        host.showPopupNotification(controller.templateTitle);
        controller.highlightModifyableTracks();
        controller.setPluginIndications(true);
        break;

      case buttons.mixer:
        controller.rotaryState = 'mixer';
        controller.displayText(controller.mixerPages[0]);
        host.showPopupNotification(controller.mixerPages[0]);
        // Scroll to the current trackBankPage (in case the active track was changed after leaving mixer mode).
        controller.scrollToTrackBankPage();
        controller.highlightModifyableTracks();
        controller.setPluginIndications(false);
        break;

      case buttons.midi:
        controller.displayText(controller.defaultTemplateTitle);
        host.showPopupNotification(controller.defaultTemplateTitle);
        controller.rotaryState = 'midi';
        controller.highlightModifyableTracks();
        controller.setPluginIndications(false);
        break;

      case buttons.bankUp:
        if (controller.trackBankPage > 0) {
          controller.trackBankPage = controller.trackBankPage - 1;
          controller.trackBank.scrollTracksPageUp();
        }
        controller.displayText("Bank " + (controller.trackBankPage + 1) + "/" + (controller.maxTrackBankPage + 1))
        host.showPopupNotification("Track Bank: " + (controller.trackBankPage + 1));
        break;

      case buttons.bankDown:
        if (controller.trackBankPage < controller.maxTrackBankPage) {
          controller.trackBankPage = controller.trackBankPage + 1;
          controller.trackBank.scrollTracksPageDown();
        }
        controller.displayText("Bank " + (controller.trackBankPage + 1) + "/" + (controller.maxTrackBankPage + 1))
        host.showPopupNotification("Track Bank: " + (controller.trackBankPage + 1));
        break;

      case buttons.pageUp:
        switch (controller.rotaryState) {
          case 'mixer':
            controller.mixerPage = controller.upWrap(controller.mixerPage, controller.mixerPages.length);
            controller.displayText(controller.mixerPages[controller.mixerPage]);
            controller.highlightModifyableTracks();
            break;  
        }
        break;

      case buttons.pageDown:
        switch (controller.rotaryState) {
          case 'mixer':
            controller.mixerPage = controller.downWrap(controller.mixerPage, controller.mixerPages.length);
            controller.displayText(controller.mixerPages[controller.mixerPage]);
            controller.highlightModifyableTracks();
            break;  
        }
        break;

      case buttons.rewind:
        controller.rewindPressed = !!value;

        if (!!value) {
          host.scheduleTask(function() {
            controller.moveTransport.call(controller, controller.shiftPressed ? -0.3 : -0.02);
          }, [], 0);
        }
        break;

      case buttons.forward:
        controller.forwardPressed = !!value;

        if (!!value) {
          host.scheduleTask(function() {
            controller.moveTransport.call(controller, controller.shiftPressed ? 0.3 : 0.02);
          }, [], 0);
        }
        break;

      case buttons.stop:
        if (!!value) {
          controller.transport.stop();
        }
        break;

      case buttons.play:
        if (!!value) {
          controller.transport.togglePlay();
        }
        break;

      case buttons.loop:
        if (!!value) {
          controller.transport.toggleLoop();
        }
        break;

      case buttons.record:
        if (!!value) {
          controller.transport.record();
        }
        break;

      case buttons.nextTrack:
        if ('mixer' == controller.rotaryState) {
          controller.trackBank.scrollTracksPageDown();
        }
        else {
          controller.cursorTrack.selectNext();
          controller.highlightModifyableTracks();
        }

        // See "Regarding shift" at the top
        this.handleShiftPress(0);
        break;

      case buttons.prevTrack:
        if ('mixer' == controller.rotaryState) {
          controller.trackBank.scrollTracksPageUp();
        }
        else {
          controller.cursorTrack.selectPrevious();
          controller.highlightModifyableTracks();
        }
        break;
    }
  };

  this.handlePadPress = function(status, data1, data2) {
    var padIndex, midiChannel, padPressed;

    switch (data1) {
      case template.data.pad1Note.hexByteAt(0):
        padIndex = 1;
        break;

      case template.data.pad2Note.hexByteAt(0):
        padIndex = 2;
        break;

      case template.data.pad3Note.hexByteAt(0):
        padIndex = 3;
        break;

      case template.data.pad4Note.hexByteAt(0):
        padIndex = 4;
        break;

      case template.data.pad5Note.hexByteAt(0):
        padIndex = 5;
        break;
        
      case template.data.pad6Note.hexByteAt(0):
        padIndex = 6;
        break;
        
      case template.data.pad7Note.hexByteAt(0):
        padIndex = 7;
        break;
        
      case template.data.pad8Note.hexByteAt(0):
        padIndex = 8;
        break;

      default:
        // This is not a pad press. If we get here, we have a bug somehwere.
        println('handlePadPress(): Could not determine which pad was pressed. data1 == ' + data1);
        return;
    }



    midiChannel = MIDIChannel(status);
    padPressed = controller['pad' + padIndex + 'Pressed'];

    if (!controller.dawMode) {
      // This is the default mode. We simply map the CCs to note on/off messages.
      if (false === padPressed) {
        if (data2 > 0) {
          // We have a audible velocity value and the note is not playing, so we
          // send note on.
          controller['pad' + padIndex + 'Pressed'] = true;
          controller.sendMidiToBitwig(0x90 | midiChannel, data1, data2);
        }
        else {
          // The note is already playing so we could send channel aftertouch.
          // But aftertouch on the pads ist sent independent from the note/cc settings.
          // So we dont need to to send it manually.
        }
      }
      else if (0 === data2) {
        // The note is already playing and the velocity is 0. So we send note off.
        controller['pad' + padIndex + 'Pressed'] = false;
        controller.sendMidiToBitwig(0x80 | midiChannel, data1, 0x00);
      }
    }
    else {
      // We're in daw mode. Here we use the pads as regular buttons.
      var isKeyDown = !padPressed && data2 > 0;
      var actionName;

      switch (padIndex) {
        case 1:
          actionName = 'focus_track_header_area';
          break;

        case 2:
          actionName = 'focus_or_toggle_device_panel';
          break;

        case 3:
          actionName = 'focus_or_toggle_mixer';
          break;

        case 4:
          actionName = 'focus_or_toggle_clip_launcher';
          break;

        case 5:
          actionName = 'focus_or_toggle_detail_editor';
          break;

        case 6:
          actionName = 'focus_or_toggle_automation_editor';
          break;

        case 7:
          actionName = 'focus_or_toggle_browser_panel';
          break;

        case 8:
          actionName = 'focus_or_toggle_inspector';
          break;
      }

      if (isKeyDown) {
        controller.application.getAction(actionName).invoke();
      }
    }
  };

  this.handleMuteSoloToggle = function(value) {
    if (value == 0) {
      controller.faderButtonModeChange('solo');
    } else if (value == 1) {
      controller.faderButtonModeChange('mute');
    }
  };

  this.handleShiftPress = function(value) {
    value = !!value; // Convert to boolean
    controller.shiftPressed = value;

    if (value) {
      controller.setSilentVelocityTranslationTable();      
    }
    else {
      controller.setDefaultVelocityTranslationTable();      
    }

    switch (controller.rotaryState) {
      case 'plugin':
        for (var i=0;i<8;i++) {
          controller.cursorTrack.getPrimaryInstrument().getMacro(i).getAmount().setIndication(!controller.dawMode && !value);
          controller.cursorDevice.getParameter(i).setIndication(value);
        }
        break;
    }
  };

  this.onMidi = function(status, data1, data2) {
    printMidi(status, data1, data2);
    
    var eventType = this.getEventType(status, data1, data2);

    if (isChannelController(status)) {
      switch (eventType) {
        case 'fader':
          this.handleFaderChange(status, data1, data2);
          sendMidi(status, data1, data2);
          break;

        case 'rotary':
          this.handleRotaryChange(status, data1, data2);
          break;

        case 'muteSoloToggle':
          this.handleMuteSoloToggle(data2);
          break;

        case 'mute-solo':
          if (controller.faderButtonMode == 'mute') {
            this.handleMuteChange(status, data1, data2);
          } else if (controller.faderButtonMode == 'solo') {
            this.handleSoloChange(status, data1, data2);
          }
          break;

        case 'button':
          this.handleButtonPress(status, data1, data2);
          break;

        case 'pad':
          this.handlePadPress(status, data1, data2);
          break;

        default:
          //println('unknown event type for midi msg: ' + status + ' ' + data1 + ' ' + data2);
      }
    }
  };

  this.onSysex = function(data) {
    printSysex(data);
  };

  this.init = function(controller) {
    buttons = controller.buttons;
    faders = controller.faders;
  };

  this.init(controller);
}