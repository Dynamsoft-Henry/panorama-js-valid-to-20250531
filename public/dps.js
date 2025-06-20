

const camera = new DMCamera.Camera();
Object.assign(camera.ui.style, {
  width: '50%',
  height: '45%',
  position: 'absolute',
  top: '0px',
  right: '0px',
});
document.body.append(camera.ui);
camera.shouldCloseWhenHide = false; // don't close video when windows is hidden

const divConfig = document.getElementById('div-config')
const cbIndicateBarcodeOnVideo = document.getElementById('cb-indicate-barcode-on-video');
const cbMoreVideoArea = document.getElementById('cb-more-video-area');
const cbSavePower = document.getElementById('cb-savepower');
const selResolution = document.getElementById('sel-resolution');
const selTemplate = document.getElementById('sel-template');
const spBarcodeCount = document.getElementById('sp-barcode-count');
const btnCopyTxt = document.getElementById('btn-copy-txt');
const preDebug = document.getElementById('pre-debug');

const videoOverlayCtx = camera.addCanvas().getContext('2d');
const resultCtx = document.getElementById('cvs-result').getContext('2d');

//Dynamsoft.Core.CoreModule._bDebug = true;
// change assets name to disable cache
Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory = 'assets_2025-06-20/';
console.log(Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory);

let dpsInstanceID;
const pInit = (async()=>{
  await Dynamsoft.License.LicenseManager.initLicense('219862-TXlQcm9qX2N1c3RvbWl6ZWQ',true);
  await Dynamsoft.Core.CoreModule.loadWasm(["DBR"]);

  dpsInstanceID = await dps_createInstance();
  await funcUpdateCvrSettings();
  await funcUpdatePanoramaSettings();
  // call `await dps_deleteInstance(dpsInstanceID)` to destroy the instance and release memory.
})();


let drawedVideoOverlay = false;
let landmarksArray = [];
let frameCount = 0;
let resultImageCount = 0;
document.getElementById('btn-start').addEventListener('click', async()=>{
  if('closed' === camera.status || 'paused' === camera.status){
    // start
    await pInit;
    await camera.requestResolution(selResolution.value.split(',').map(parseInt));
    await camera.open();
    frameCount = resultImageCount = 0;
    while('opened' === camera.status){
      const timeStart = Date.now();
      let ret;
      try{
        if(cbIndicateBarcodeOnVideo.checked){
          ret = await dps_stitchImage(dpsInstanceID, camera, resultCtx, videoOverlayCtx);
          drawedVideoOverlay = true;
          // double check
          if(!cbIndicateBarcodeOnVideo.checked || 'opened' !== camera.status && 'paused' !== camera.status){
            videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
            drawedVideoOverlay = false;
          }
        }else{
          ret = await dps_stitchImage(dpsInstanceID, camera, resultCtx);
        }
      }catch(ex){
        console.log(ex);
        alert('Looks like there is an error, you need to refresh the page. Details: '+ex?.message);
        throw ex;
      }

      ++frameCount;
      const capturedPanorama = ret.capturedPanoramaArray[0];
      if(capturedPanorama.landmarksArray){
        landmarksArray = capturedPanorama.landmarksArray;
        spBarcodeCount.innerText = landmarksArray.length;
        ++resultImageCount;
      }
      // kDebug
      const rsl = camera.currentResolution;
      preDebug.textContent = [
        `${rsl.width}x${rsl.height}`,
        `${frameCount} frame(s)`,
        `${resultImageCount} result image(s)`,
        `algorithm ${ret.timeCost}ms`,
        `total ${Date.now() - timeStart}ms`,
        `memory ${(ret.memory/1024/1024).toFixed(1)}MB`
      ].join('\n');
      
      if(cbSavePower.checked){ await new Promise(r=>setTimeout(r, 100)); }
    }
  }else if('opened' === camera.status){
    // pause
    camera.pause();
  }//else opening or closing, do nothing
});

document.getElementById('btn-stop').addEventListener('click', async()=>{
  camera.close();
  if(drawedVideoOverlay){
    videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
    drawedVideoOverlay = false;
  }
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

cbIndicateBarcodeOnVideo.addEventListener('change', ()=>{
  if(!cbIndicateBarcodeOnVideo.checked && drawedVideoOverlay){
    videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
    drawedVideoOverlay = false;
  }
});

cbMoreVideoArea.addEventListener('change', ()=>{
  if(cbMoreVideoArea.checked){
    Object.assign(camera.ui.style, {
      width: '100%',
      height: '70%',
      zIndex: '-1',
    });
    divConfig.style.height = '70svh';
    resultCtx.canvas.style.height = '25svh';
  }else{
    Object.assign(camera.ui.style, {
      width: '50%',
      height: '45%',
      zIndex: undefined,
    });
    divConfig.style.height = '45svh';
    resultCtx.canvas.style.height = '50svh';
  }
});

selResolution.addEventListener('change', async()=>{
  await camera.requestResolution(selResolution.value.split(',').map(parseInt));
  await funcUpdateCvrSettings();
  await funcUpdatePanoramaSettings();
})

selTemplate.addEventListener('change', async()=>{
  await pInit;
  await funcUpdateCvrSettings();
})

btnCopyTxt.addEventListener('click', ()=>{
  navigator.clipboard.writeText(landmarksArray.map(l=>l.text).join('\n'));
});





// Helper code. You don't need to care about the following implementation details.

const funcUpdateCvrSettings = async()=>{
  let tpl = await fetch(selTemplate.value).then(r=>r.text());
  if(parseInt(selResolution.value.split(',')[0]) > 1920){
    tpl = tpl.replace(',{"Mode":"LM_LINES"}', ''); // speed up ligh resolution
  }
  await dps_initCVRSettings(dpsInstanceID, tpl);
}
const funcUpdatePanoramaSettings = async()=>{
  let tpl = await fetch('template_panorama.json?v=20240528').then(r=>r.text());
  if(parseInt(selResolution.value.split(',')[0]) > 1920){
    tpl = tpl.replace('"PanoramicImageScalePercent": 50,', '"PanoramicImageScalePercent": 25,'); // speed up ligh resolution
  }
  await dps_initSettings(dpsInstanceID, tpl);
}
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
  settingsObj.BatchScanTemplates[0].ThreadManagementMode = 0;
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
    Dynamsoft.Core.mapTaskCallBack[taskID] = async(body) => {

      // kdebug: collect image
      if(document.querySelector('#cb-upload-frame').checked){
        try{
          let cvs = frameCvs;
          let fd = new FormData();
          if (cvs != null) {
            let blob = cvs.convertToBlob
              ? await cvs.convertToBlob()
              : await new Promise((resolve) => {
                cvs.toBlob((blob) => resolve(blob));
              });
            fd.append("img", blob);
            await fetch("collect", {
              method: "POST",
              body: fd,
            });
          }
        }catch(ex){console.log(ex);}
      }

      if (body.success) {
        const ret = body.response;
        const capturedPanorama = ret.capturedPanoramaArray[0];
        const image = capturedPanorama.image;
        const resultCvs = resultCtx.canvas;
        if(capturedPanorama.errorCode){
          console.warn(`errorCode: ${capturedPanorama.errorCode}, errorMessage: ${capturedPanorama.errorString}`);
          let errorString = capturedPanorama.errorString;
          if(capturedPanorama.errorCode <= -20000 && capturedPanorama.errorCode > -30000){
            errorString = errorString || 'License Error';
          }
          throw(Error(errorString));
        }
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

