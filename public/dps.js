

const camera = new DMCamera.Camera();
Object.assign(camera._coreWrapper.style, {
  width: '50%',
  height: '45%',
  position: 'absolute',
  top: '0px',
  right: '0px',
});
document.body.append(camera._coreWrapper);

const divConfig = document.getElementById('div-config')
const cbIndicateBarcodeOnVideo = document.getElementById('cb-indicate-barcode-on-video');
const cbMoreVideoArea = document.getElementById('cb-more-video-area');
const cbSavePower = document.getElementById('cb-savepower');
const selTemplate = document.getElementById('sel-template');
const spBarcodeCount = document.getElementById('sp-barcode-count');
const btnCopyTxt = document.getElementById('btn-copy-txt');

const videoOverlayCtx = camera.addCanvas().getContext('2d');
const resultCtx = document.getElementById('cvs-result').getContext('2d');

//Dynamsoft.Core.CoreModule._bDebug = true;
Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory = 'assets/';

let dpsInstanceID;
const pInit = (async()=>{
  await Dynamsoft.License.LicenseManager.initLicense('219862-TXlQcm9qX2N1c3RvbWl6ZWQ',true);
  await Dynamsoft.Core.CoreModule.loadWasm(["DBR"]);

  dpsInstanceID = await dps_createInstance();
  console.log(await dps_initCVRSettings(dpsInstanceID, await fetch(selTemplate.value).then(r=>r.text())));
  console.log(await dps_initSettings(dpsInstanceID, await fetch('template_panorama.json').then(r=>r.text())));
  // call `await dps_deleteInstance(dpsInstanceID)` to destroy the instance and release memory.
})();


let drawedVideoOverlay = false;
let landmarksArray = [];
document.getElementById('btn-start').addEventListener('click', async()=>{
  if('closed' === camera.status || 'paused' === camera.status){
    // start
    await pInit;
    await camera.open();
    while('opened' === camera.status){
      const timeStart = Date.now();
      let ret;
      try{
        if(cbIndicateBarcodeOnVideo.checked){
          ret = await dps_stitchImage(dpsInstanceID, camera, resultCtx, videoOverlayCtx);
          drawedVideoOverlay = true;
        }else{
          if(drawedVideoOverlay){
            videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
            drawedVideoOverlay = false;
          }
          ret = await dps_stitchImage(dpsInstanceID, camera, resultCtx);
        }
      }catch(ex){
        console.log(ex);
        alert('Looks like there is an error, you need to refresh the page. Details: '+ex?.message);
        throw ex;
      }
      
      landmarksArray = ret.capturedPanoramaArray[0].landmarksArray;
      spBarcodeCount.innerText = landmarksArray.length;
      document.title = `${ret.timeCost}/${Date.now() - timeStart}ms`;
      
      if(!cbSavePower.checked){ await new Promise(r=>setTimeout(r, 100)); }
    }
    if('paused' !== camera.status && drawedVideoOverlay){
      videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
    }
  }else if('opened' === camera.status){
    // pause
    camera.pause();
  }//else opening or closing, do nothing
});

document.getElementById('btn-stop').addEventListener('click', async()=>{
  camera.close();
  if(dpsInstanceID){ await dps_clean(dpsInstanceID); }
});

document.getElementById('btn-save').addEventListener('click', async()=>{
  const blob = await new Promise(rs=>{
    resultCtx.canvas.toBlob(rs);
  });

  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = 'panorama_'+Date.now()+'.png';

  document.body.appendChild(link);
  link.dispatchEvent(
    new MouseEvent('click', { 
      bubbles: true, 
      cancelable: true, 
      view: window 
    })
  );
  document.body.removeChild(link);
  
});

cbMoreVideoArea.addEventListener('change', ()=>{
  if(cbMoreVideoArea.checked){
    Object.assign(camera._coreWrapper.style, {
      width: '100%',
      height: '70%',
      zIndex: '-1',
    });
    divConfig.style.height = '70svh';
    resultCtx.canvas.style.height = '25svh';
  }else{
    Object.assign(camera._coreWrapper.style, {
      width: '50%',
      height: '45%',
      zIndex: undefined,
    });
    divConfig.style.height = '45svh';
    resultCtx.canvas.style.height = '50svh';
  }
});

selTemplate.addEventListener('change', async()=>{
  await pInit;
  await dps_initCVRSettings(dpsInstanceID, await fetch(selTemplate.value).then(r=>r.text()));
})

btnCopyTxt.addEventListener('click', ()=>{
  navigator.clipboard.writeText(landmarksArray.map(l=>l.text).join('\n'));
});





// Helper code. You don't need to care about the following implementation details.

const dps_createInstance = async()=>{
  let taskID = Dynamsoft.Core.getNextTaskID();
  return await new Promise((rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = (body) => {
      if (body.success) {
        rs(body.instanceID);
      } else {
        const err = Error(body.message);
        if (body.stack) { err.stack = body.stack; }
        rj(err);
      }
    }
    Dynamsoft.Core.worker.postMessage({
      type: 'dps_createInstance',
      body: {},
      id: taskID,
    });
  });
};
const dps_initCVRSettings = async(dpsInstanceID, cvrSettings)=>{
  let taskID = Dynamsoft.Core.getNextTaskID();
  return await new Promise(async(rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = (body) => {
      if (body.success) {
        rs(body.response)
      } else {
        const err = Error(body.message);
        if (body.stack) { err.stack = body.stack; }
        rj(err);
      }
    }
    Dynamsoft.Core.worker.postMessage({
      type: 'dps_initCVRSettings',
      instanceID: dpsInstanceID,
      body: {
        settings: cvrSettings,
      },
      id: taskID,
    });
  });
};
const dps_initSettings = async(dpsInstanceID, settings)=>{
  let settingsObj = JSON.parse(settings);
  settingsObj.PanoramaSettings[0].ThreadMode = 0;
  settings = JSON.stringify(settingsObj);
  let taskID = Dynamsoft.Core.getNextTaskID();
  return await new Promise(async(rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = (body) => {
      if (body.success) {
        rs(body.response)
      } else {
        const err = Error(body.message);
        if (body.stack) { err.stack = body.stack; }
        rj(err);
      }
    }
    Dynamsoft.Core.worker.postMessage({
      type: 'dps_initSettings',
      instanceID: dpsInstanceID,
      body: {
        settings: settings,
      },
      id: taskID,
    });
  });
};
const dps_stitchImage = async(dpsInstanceID, camera, resultCtx, videoOverlayCtx = undefined)=>{
  const frameCvs = camera.getFrame();
  const u8 = frameCvs.getContext("2d").getImageData(0, 0, frameCvs.width, frameCvs.height).data;
  if(!u8.length){console.log('no image');return;}
  let taskID = Dynamsoft.Core.getNextTaskID();
  return await new Promise((rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = (body) => {
      if (body.success) {
        const ret = body.response;
        const capturedPanorama = ret.capturedPanoramaArray[0];
        const image = capturedPanorama.image;
        const resultCvs = resultCtx.canvas;
        if(image){
          if(resultCvs.width !== image.width){ resultCvs.width = image.width; }
          if(resultCvs.height !== image.height){ resultCvs.height = image.height; }
          const bgrBytes = image.bytes;
          const rgbaBytes = new Uint8ClampedArray(image.height * image.width * 4);
          for(let i = 0, length = image.height * image.width; i < length; ++i){
            rgbaBytes[i*4+2] = bgrBytes[i*3];
            rgbaBytes[i*4+1] = bgrBytes[i*3+1];
            rgbaBytes[i*4] = bgrBytes[i*3+2];
            rgbaBytes[i*4+3] = 255;
          }
          resultCtx.putImageData(new ImageData(rgbaBytes, image.width, image.height), 0, 0);

          resultCtx.fillStyle = 'rgba(0,255,0,0.5)';
          resultCtx.strokeStyle = 'rgba(0,255,0,1)';
          resultCtx.lineWidth = 1;
          for(let landmark of capturedPanorama.landmarksArray){
            let p = landmark.location.points;
            resultCtx.beginPath();
            resultCtx.moveTo(p[0].x, p[0].y);
            resultCtx.lineTo(p[1].x, p[1].y);
            resultCtx.lineTo(p[2].x, p[2].y);
            resultCtx.lineTo(p[3].x, p[3].y);
            resultCtx.fill();
            resultCtx.closePath();
            resultCtx.stroke();
          }
        }

        if(videoOverlayCtx && ret.frameMappedResult?.landmarksArray){
          videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
          videoOverlayCtx.fillStyle = 'rgba(0,255,0,0.5)';
          videoOverlayCtx.strokeStyle = 'rgba(0,255,0,1)';
          videoOverlayCtx.lineWidth = 1;
          for(let landmark of ret.frameMappedResult.landmarksArray){
            let p = landmark.location.points;
            videoOverlayCtx.beginPath();
            videoOverlayCtx.moveTo(p[0].x, p[0].y);
            videoOverlayCtx.lineTo(p[1].x, p[1].y);
            videoOverlayCtx.lineTo(p[2].x, p[2].y);
            videoOverlayCtx.lineTo(p[3].x, p[3].y);
            videoOverlayCtx.fill();
            videoOverlayCtx.closePath();
            videoOverlayCtx.stroke();
          }
        }
        rs({...ret, resultCvs});
      } else {
        const err = Error(body.message);
        if (body.stack) { err.stack = body.stack; }
        rj(err);
      }
    }
    Dynamsoft.Core.worker.postMessage({
      type: 'dps_setPanoramicBaseImage',
      instanceID: dpsInstanceID,
      body: {
        bytes: u8,
        width: frameCvs.width,
        height: frameCvs.height,
        stride: frameCvs.width*4,
        format: 10,
        templateName: ''
      },
      id: taskID,
    });
  });
};
const dps_clean = async(dpsInstanceID)=>{
  let taskID = Dynamsoft.Core.getNextTaskID();
  await new Promise((rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = (body) => {
      if (body.success) {
        rs()
      } else {
        const err = Error(body.message);
        if (body.stack) { err.stack = body.stack; }
        rj(err);
      }
    }
    Dynamsoft.Core.worker.postMessage({
      type: 'dps_clean',
      instanceID: dpsInstanceID,
      id: taskID,
    });
  });
};
const dps_deleteInstance = async(dpsInstanceID)=>{
  let taskID = Dynamsoft.Core.getNextTaskID();
  await new Promise((rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = (body) => {
      if (body.success) {
        rs();
      } else {
        const err = Error(body.message);
        if (body.stack) { err.stack = body.stack; }
        rj(err);
      }
    }
    Dynamsoft.Core.worker.postMessage({
      type: 'dps_deleteInstance',
      instanceID: dpsInstanceID,
      id: taskID,
    });
  });
};

