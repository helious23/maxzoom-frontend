import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { io } from "socket.io-client";

const socket = io("wss://spotty-lizard-97.loca.lt", {
  transports: ["websocket"],
});

function App() {
  const { handleSubmit, setValue, register } = useForm();

  const [myStream, setMyStream] = useState();
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [cameras, setCameras] = useState();
  const [currentCamera, setCurrentCamera] = useState();
  const [roomName, setRoomName] = useState();
  const [myPeerConnection, setMyPeerConnection] = useState();
  const [offer, setOffer] = useState();
  const [answer, setAnswer] = useState();

  const myFaceRef = useRef();
  const peerFaceRef = useRef();

  const getCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((device) => device.kind === "videoinput"));
    } catch (error) {
      console.log(error);
    }
  };

  const getMedia = async (deviceId) => {
    const initialConstrains = {
      audio: true,
      video: { facingMode: "user" },
    };
    const cameraConstrains = {
      audio: true,
      video: { deviceId: { exact: deviceId } },
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        deviceId ? cameraConstrains : initialConstrains
      );
      setMyStream(stream);
      if (!deviceId) {
        await getCameras();
      }
    } catch (error) {
      console.log(error);
    }
  };

  const toggleMute = () => {
    myStream
      .getAudioTracks()
      .forEach((track) => (track.enabled = !track.enabled));
    setMuted((prev) => !prev);
  };

  const toggleCameraOff = () => {
    myStream
      .getVideoTracks()
      .forEach((track) => (track.enabled = !track.enabled));
    setCameraOff((prev) => !prev);
  };

  const onCameraChange = async (event) => {
    await getMedia(event.target.value);
    if (myPeerConnection) {
      const videoTrack = myStream.getVideoTracks()[0];
      const videoSender = myPeerConnection
        .getSenders()
        .find((sender) => sender.track.kind === "video");
      videoSender.replaceTrack(videoTrack);
    }
  };

  useEffect(() => {
    if (myStream && roomName) {
      myFaceRef.current.srcObject = myStream;
      setCurrentCamera(myStream.getVideoTracks()[0]);
    }
  }, [myStream, roomName]);

  const makeConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: ["turn:3.39.16.193:3478?transport=tcp"],
          username: process.env.REACT_APP_TURN_USERNAME,
          credential: process.env.REACT_APP_TURN_PASSWORD,
        },
      ],
    });
    setMyPeerConnection(peerConnection);
  };

  const handleIce = (data) => {
    console.log("send candidate");
    socket.emit("ice", data.candidate, roomName);
  };

  const handleTrack = (data) => {
    peerFaceRef.current.srcObject = data.streams[0];
  };

  useEffect(() => {
    if (myStream && myPeerConnection) {
      myStream
        .getTracks()
        .forEach((track) => myPeerConnection.addTrack(track, myStream));
      socket.on("welcome", async () => {
        const createdOffer = await myPeerConnection.createOffer();
        setOffer(createdOffer);
      });
      socket.on("answer", (answer) => {
        console.log("received answer");
        myPeerConnection.setRemoteDescription(answer);
      });
      myPeerConnection.addEventListener("icecandidate", handleIce);
      myPeerConnection.addEventListener("track", handleTrack);
      socket.on("ice", (ice) => {
        myPeerConnection.addIceCandidate(ice);
      });
    }
  }, [myStream, myPeerConnection, roomName]);

  useEffect(() => {
    if (myPeerConnection && offer) {
      myPeerConnection.setLocalDescription(offer);
      console.log("send the offer");
      socket.emit("offer", offer, roomName);
    }
  }, [myPeerConnection, offer, roomName]);

  useEffect(() => {
    if (myPeerConnection) {
      socket.on("offer", async (offer) => {
        console.log("received the offer");
        myPeerConnection.setRemoteDescription(offer);
        const createdAnswer = await myPeerConnection.createAnswer();
        setAnswer(createdAnswer);
      });
    }
  }, [myPeerConnection, roomName]);

  useEffect(() => {
    if (myPeerConnection && answer && roomName) {
      myPeerConnection.setLocalDescription(answer);
      console.log("send the answer");
      socket.emit("answer", answer, roomName);
    }
  }, [myPeerConnection, answer, roomName]);

  const initCall = async () => {
    await getMedia();
    makeConnection();
  };

  const onValid = async (data) => {
    const { inputRoomName } = data;
    setRoomName(inputRoomName);
    await initCall();
    socket.emit("join_room", inputRoomName);
    setValue("inputRoomName", "");
  };

  return (
    <div>
      <header>
        <h1>Max Zoom</h1>
      </header>
      <main>
        {!roomName ? (
          <div>
            <form onSubmit={handleSubmit(onValid)}>
              <input type="text" {...register("inputRoomName")} />
              <button>채팅방 들어가기</button>
            </form>
          </div>
        ) : (
          <div>
            {myStream && (
              <div>
                <video
                  autoPlay
                  playsInline
                  width={400}
                  height={400}
                  ref={myFaceRef}
                />
                <button onClick={toggleMute}>
                  {muted ? "음소거 해제" : "음소거"}
                </button>
                <button onClick={toggleCameraOff}>
                  {cameraOff ? "카메라 켜기" : "카메라 끄기"}
                </button>
                {currentCamera ? (
                  <select onChange={onCameraChange}>
                    {cameras
                      ? cameras.map((camera) => (
                          <option key={camera.deviceId} value={camera.deviceId}>
                            {camera.label}
                          </option>
                        ))
                      : null}
                  </select>
                ) : null}
              </div>
            )}
            <video
              autoPlay
              playsInline
              width={400}
              height={400}
              ref={peerFaceRef}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
