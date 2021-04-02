import { DeviceEventEmitter } from "react-native";
import MediaSession from "./MediaSession";

export default class RNTrackPlayer {
    STATE_NONE = 0;
    STATE_STOPPED = 1;
    STATE_PAUSED = 2;
    STATE_PLAYING = 3;
    STATE_BUFFERING = 4;

    PLAYBACK_STATE = "playback-state";
    PLAYBACK_TRACK_CHANGED = "playback-track-changed";
    PLAYBACK_QUEUE_ENDED = "playback-queue-ended";
    PLAYBACK_ERROR = "playback-error";
    PLAYBACK_METADATA_RECEIVED = "playback-metadata-received";

    constructor() {
        this.emitter = DeviceEventEmitter;
        this.mediaSession = new MediaSession(
            this.play,
            this.pause,
            this.skipToNext,
            this.skipToPrevious
        );

        this.audio = null;
        this.currentId = null;

        this.playlist = [];
        this.track = null;
        this.index = null;
    }

    _emitNextTrack = id => {
        let position = this.audio != null
            ? this.audio.currentTime
            : -0.01

        this.emitter.emit(
            this.PLAYBACK_TRACK_CHANGED,
            {nextTrack: id, position: position,track: this.currentId}
        );

        this.currentId = id;
    }


    play = () => {
        if (this.audio != null) {
            this.audio.play();
            if (!this.audio.paused) {
                this.emitter.emit(this.PLAYBACK_STATE, {state: this.STATE_PLAYING});
                this.mediaSession.setPlaying();
            } else {
                this.emitter.emit(this.PLAYBACK_STATE, {state: this.STATE_PAUSED});
                this.mediaSession.setPaused();
            }
        }
    }

    pause = () => {
        if (this.audio != null) {
            this.audio.pause();
            this.mediaSession.setPaused();
            this.emitter.emit(this.PLAYBACK_STATE, {state: this.STATE_PAUSED});
        }
    }

    remove = id => {
        let newList = [];
        for (let i = 0; i < this.playlist.length; i++) {
            if (this.playlist[i].id != id)
                newList.push(this.playlist[i]);
        }

        this.playlist = newList;
    }

    add = (track_list, afterId) => {
        if (afterId == undefined)
            afterId = null;

        if (afterId == null) {
            for (let i = 0; i < track_list.length; i++) {
                this.playlist.push(track_list[i]);
            }
        } else {
            let newList = [];
            for (let i = 0; i < this.playlist.length; i++) {
                if (this.playlist[i].id == afterId) {
                    for (let j = 0; j < track_list.length; j++) {
                        newList.push(track_list[j]);
                    }

                    newList.push(this.playlist[i]);

                } else {
                    newList.push(this.playlist[i]);

                }
            }

            this.playlist = newList;
        }
    }

    stop = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null) {
                this.audio.stop();
                this.emitter.emit(this.PLAYBACK_STATE, {state: this.STATE_STOPPED});
            }
            resolve();
        });
    }

    reset = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null)
                this.audio = null;

            this.track = null;
            this.currentId = null;
            this.playlist = [];
            this.index = 0;
            this.emitter.emit(this.PLAYBACK_STATE, {state: this.STATE_NONE});
            resolve();
        });
        
    }

    destroy = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null)
                this.audio = null;

            this.track = null;
            this.currentId = null;
            this.playlist = [];
            this.index = 0;
            this.emitter.emit(this.PLAYBACK_STATE, {state: this.STATE_NONE});
            resolve();
        });
    }

    skip = id => {
        return new Promise((resolve, reject) => {
            this.emitter.emit(this.PLAYBACK_STATE, {state: this.STATE_BUFFERING});

            for (let i = 0; i < this.playlist.length; i++) {
                if (this.playlist[i].id == id) {
                    if (this.playlist[i].url != null) {
                        this.index = i;
                        this.track = this.playlist[i];

                        if (this.audio == null) {
                            this.audio = new Audio(this.track.url);
                            this.audio.addEventListener("ended", e => {
                                this.mediaSession.setPaused();
                                if (this.playlist.length - 1 == this.index) {
                                    this.emitter.emit(this.PLAYBACK_STATE, { state: this.STATE_PAUSED});
                                } else {
                                    this.emitter.emit(this.PLAYBACK_STATE, { state: this.STATE_BUFFERING});
                                    this.skipToNext(true);
                                }
                            });
                        } else
                            this.audio.src = this.track.url;
                        
                        this._emitNextTrack(id);
                        
                        try {
                            this.mediaSession.setMetadata(this.track.title, this.track.artist, this.track.artwork);
                            this.audio.play();
                            if (!this.audio.paused) {
                                this.emitter.emit(this.PLAYBACK_STATE, { state: this.STATE_PLAYING });
                                this.mediaSession.setPlaying();
                            } else {
                                this.emitter.emit(this.PLAYBACK_STATE, { state: this.STATE_PAUSED });
                                this.mediaSession.setPaused();
                            }
                            
                        } catch (e) {
                            console.log(e);
                        }

                    } else {
                        this._emitNextTrack(id);
                        this.emitter.emit(this.PLAYBACK_ERROR, { reason: "url is missing" });
                    }

                    resolve();
                    break;
                }
            }
        });
    }

    skipToNext = async(wasPlaying) => {
        if (this.playlist != null) {
            if (this.playlist.length - 1 == this.index) {
                this.emitter.emit(
                    this.PLAYBACK_QUEUE_ENDED,
                    {
                        track: this.currentId,
                        position: this.track.currentTime
                    }
                );
            } else {
                if (this.playlist[this.index + 1].url == null) {
                    //this._emitNextTrack(null);
                    this.emitter.emit(this.PLAYBACK_ERROR, { reason: "url is missing" });
                } else {
                    this.skip(this.playlist[this.index + 1].id);
                    if (wasPlaying)
                        this.play();
                }
            }
        }
    }

    skipToPrevious = () => {
        if (this.playlist != null) {
            if (this.index != 0) {
                this.skip(this.playlist[this.index - 1].id);
            }
        }
    }

    removeUpcomingTracks = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null) {
                if (this.audio.fastSeek != undefined)
                    this.audio.fastSeek(seconds);
                else
                    this.audio.currentTime = seconds;
            }
            resolve(seconds);
        });
    }

    setVolume = () => {}

    setRate = () => {}

    seekTo = seconds => {
        return new Promise((resolve, reject) => {
            if (this.audio != null) {
                if (this.audio.fastSeek != undefined)
                    this.audio.fastSeek(seconds);
                else
                    this.audio.currentTime = seconds;
            }
            resolve(seconds);
        });
    }

    getTrack = id => {
        return new Promise((resolve, reject) => {
            for (let i = 0; i < this.playlist.length; i++) {
                if (this.playlist[i].id == id)
                    resolve(this.playlist[i]);
            }
        });
    }

    getCurrentTrack = () => {
        return new Promise((resolve, reject) => {
            if (this.track != null)
                resolve(this.track.id);
            else
                resolve(null);
        });
    }

    getPosition = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null)
                resolve(this.audio.currentTime);
            else
                resolve(0); 
        });
    }

    getVolume = () => {}

    getDuration = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null)
                resolve(this.track.duration);
            else
                resolve(0);
        });
    }


    getBufferedPosition = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null)
                resolve(this.audio.buffered);
        });
    }

    getState = () => {
        return new Promise((resolve, reject) => {
            if (this.audio == null)
                resolve(this.STATE_NONE);
            else {
                if (this.audio.paused)
                    resolve(this.STATE_PAUSED);
                else
                    resolve(this.STATE_PLAYING);
            }
        });
    }

    getRate = () => {
        return new Promise((resolve, reject) => {
            if (this.audio != null)
                resolve(this.audio.defaultPlaybackRate);
            else
                resolve(null);
        });
    }

    getQueue = () => {
        return new Promise((resolve, reject) => {
            resolve(this.playlist);
        });
    }

    updateOptions = () => {}
}

module.exports = {TrackPlayerModule: new RNTrackPlayer()};