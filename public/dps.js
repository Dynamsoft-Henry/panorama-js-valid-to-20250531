
const camera = new DMCamera.Camera();
camera.objectFit = 'cover';
Object.assign(camera.ui.style, {
  width: '50%',
  height: '45%',
  position: 'absolute',
  top: '0px',
  right: '0px',
  zIndex: '-1',
});
document.body.append(camera.ui);
camera.shouldCloseWhenHide = false; // don't close video when windows is hidden

const divConfig = document.getElementById('div-config')
const cbIndicateBarcodeOnVideo = document.getElementById('cb-indicate-barcode-on-video');
const cbMoreVideoArea = document.getElementById('cb-more-video-area');
const cbSavePower = document.getElementById('cb-savepower');
const selResolution = document.getElementById('sel-resolution');

const spBarcodeCount = document.getElementById('sp-barcode-count');
const preDebug = document.getElementById('pre-debug');

const videoOverlayCtx = camera.addCanvas().getContext('2d');
const resultCtx = document.getElementById('cvs-result').getContext('2d');

//Dynamsoft.Core.CoreModule._bDebug = true;
// change assets name to disable cache
Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory = 'assets_2025-07-09/';
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
let frameCount = 0;//kdebug
document.getElementById('btn-start').addEventListener('click', async()=>{
  //// This button has two functions, start or pause

  if('closed' === camera.status || 'paused' === camera.status){
    //// excute start
    if('closed' === camera.status){
      // clear old result canvas if exists
      resultCtx.canvas.width = resultCtx.canvas.height = 0;
    }
    await pInit;
    await camera.requestResolution(selResolution.value.split(',').map(parseInt));
    await camera.open();
    frameCount = 0; //kdebug
    while('opened' === camera.status){
      ++frameCount; //kdebug

      let stitchImageResult;
      try{
        stitchImageResult = await dps_stitchImage(dpsInstanceID, camera);
      }catch(ex){
        console.log(ex);
        alert('Looks like there is an error, you need to refresh the page. Details: '+ex?.message);
        throw ex;
      }

      drawResultCanvas(stitchImageResult, resultCtx);

      if(cbIndicateBarcodeOnVideo.checked && ('opened' === camera.status || 'paused' === camera.status)){
        drawVideoOverlay(stitchImageResult, videoOverlayCtx);
        drawedVideoOverlay = true;
      }

      let _landmarksArray = stitchImageResult?.capturedPanoramaArray?.[0]?.landmarksArray;
      if(_landmarksArray){
        landmarksArray = _landmarksArray;
        spBarcodeCount.innerText = landmarksArray.length;
      }
      
      if(cbSavePower.checked){ await new Promise(r=>setTimeout(r, 100)); }
    }

  }else if('opened' === camera.status){
    //// excute pause
    camera.pause();
    // Camera becomes 'paused' from 'opened'
    // So stitchImage for milestone
    let stitchImageResult = await dps_stitchImage4Milestone(dpsInstanceID);
    drawResultCanvas(stitchImageResult, resultCtx);

  }//// else opening or closing, do nothing
});

document.getElementById('btn-reset').addEventListener('click', async()=>{
  if(!dpsInstanceID){ return; }

  // hide current and subsequent results during `dps_clean`
  resultCtx.canvas.style.visibility = 'hidden';

  await dps_clean(dpsInstanceID);

  // clear old result canvas
  resultCtx.canvas.width = resultCtx.canvas.height = 0;
  // and ready for subsequent results
  resultCtx.canvas.style.visibility = '';
});

// `stop`, `saveImage` and `copyTxt`,
// they are usually a group of linked operations,
// can be combined into one button. 
document.getElementById('btn-stop').addEventListener('click', async()=>{
  if(!dpsInstanceID){ return; }

  camera.close();
  if(drawedVideoOverlay){
    videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
    drawedVideoOverlay = false;
  }

  // Camera becomes 'closed' from 'opened'
  // So stitchImage for milestone
  let stitchImageResult = await dps_stitchImage4Milestone(dpsInstanceID);
  drawResultCanvas(stitchImageResult, resultCtx);

  await dps_clean(dpsInstanceID);
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
document.getElementById('btn-copy-txt').addEventListener('click', ()=>{
  navigator.clipboard.writeText(landmarksArray.map(l=>l.text).join('\n'));
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
    });
    divConfig.style.height = '70svh';
    resultCtx.canvas.style.height = '25svh';
  }else{
    Object.assign(camera.ui.style, {
      width: '50%',
      height: '45%',
    });
    divConfig.style.height = '45svh';
    resultCtx.canvas.style.height = '50svh';
  }
});

selResolution.addEventListener('change', async()=>{
  await camera.requestResolution(selResolution.value.split(',').map(parseInt));
});
document.getElementById('btn-troch', ()=>{
  if(camera.isTorchOn){
    camera.turnOffTorch();
  }else{
    camera.turnOnTorch();
  }
});






// Helper code. SDK users don't need to care about the following implementation details.



const selSpeedCoverage = document.getElementById('sel-speed-coverage');
const selBarcodeFormat = document.getElementById('sel-barcode-format');
const selBarcodeColor = document.getElementById('sel-barcode-color');

selSpeedCoverage.addEventListener('change', async()=>{
  await pInit;
  await funcUpdateCvrSettings();
  await funcUpdatePanoramaSettings();
});
selBarcodeFormat.addEventListener('change', async()=>{
  await pInit;
  await funcUpdateCvrSettings();
  await funcUpdatePanoramaSettings();
});
selBarcodeColor.addEventListener('change', async()=>{
  await pInit;
  await funcUpdateCvrSettings();
});

// For dynamsoft TST and developer, currently our templates are based on dbr10, please do not use dbr11 templates.
const funcUpdateCvrSettings = async()=>{
  let tpl = await fetch('template_cvr.json?v=20250711').then(r=>r.text());

  
  //// If you have customized the template, please consider removing if/else code
  if('speed' === selSpeedCoverage.value){
    tpl = tpl
      .replace(/,\s*{\s*"Mode"\s*:\s*"LM_LINES"\s*}/, '')
      .replace(/,\s*{\s*"Mode"\s*:\s*"DM_THRESHOLD_BINARIZATION"\s*}/, '')
      .replace(/,\s*{\s*"Mode"\s*:\s*"DM_DIRECT_BINARIZATION"\s*}/, '')
      .replace(/,\s*{\s*"Mode"\s*:\s*"DM_DEEP_ANALYSIS"\s*}/, '');
  }else if('balance' === selSpeedCoverage.value){
    tpl = tpl
      .replace(/,\s*{\s*"Mode"\s*:\s*"DM_DEEP_ANALYSIS"\s*}/, '');
  }
  if('1D' === selBarcodeFormat.value){
    tpl = tpl
      .replace(/,\s*"BarcodeFormatIds"\s*:\s*\[\s*"BF_ALL"\s*\]/, ',"BarcodeFormatIds":["BF_ONED"]');
  }else if('2D' === selBarcodeFormat.value){
    tpl = tpl
      .replace(/,\s*"BarcodeFormatIds"\s*:\s*\[\s*"BF_ALL"\s*\]/, ',"BarcodeFormatIds":["BF_MICRO_PDF417","BF_PDF417","BF_QR_CODE","BF_DATAMATRIX","BF_AZTEC","BF_MICRO_QR"]');
  }
  if('normal' === selBarcodeColor.value){
    tpl = tpl
      .replace(/,\s*{\s*"Mode"\s*:\s*"GTM_INVERTED"\s*}\s*/, '');
  }else if('inverted' === selBarcodeColor.value){
    tpl = tpl
      .replace(/{\s*"Mode"\s*:\s*"GTM_ORIGINAL"\s*}\s*,/, '');
  }


  //console.log(tpl);//kdebug
  await dps_initCVRSettings(dpsInstanceID, tpl);
}
const funcUpdatePanoramaSettings = async()=>{
  let tpl = await fetch('template_panorama.json?v=20240628').then(r=>r.text());


  //// If you have customized the template, please consider removing if/else code
  if('speed' === selSpeedCoverage.value){
    tpl = tpl
      .replace(/"MemoryKeepLevel"\s*:\s*[0-9]*/, '"MemoryKeepLevel" : 3');
  }
  if('1D' === selBarcodeFormat.value){
    tpl = tpl
      .replace(/,\s*"BarcodeFormatIds"\s*:\s*\[\s*"BF_ALL"\s*\]/, ',"BarcodeFormatIds":["BF_ONED"]');
  }else if('2D' === selBarcodeFormat.value){
    tpl = tpl
      .replace(/,\s*"BarcodeFormatIds"\s*:\s*\[\s*"BF_ALL"\s*\]/, ',"BarcodeFormatIds":["BF_MICRO_PDF417","BF_PDF417","BF_QR_CODE","BF_DATAMATRIX","BF_AZTEC","BF_MICRO_QR"]');
  }


  //console.log(tpl);//kdebug
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
const dps_stitchImage = async(dpsInstanceID, camera)=>{
  const timeStart = Date.now();// kDebug

  const frameCvs = camera.getFrame();

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
        fd.append("name", (new Date().toISOString().replace(/[:-]/g,'').replace(/[T\.]/g,'_'))+'-'+frameCount.toString().padStart(3, '0')+'.png');
        fd.append("img", blob);
        await fetch("collect", {
          method: "POST",
          body: fd,
        });
      }
    }catch(ex){console.log(ex);}

    // avoid send another image when stop or pause is called
    // Only necessary when you need to upload frames (because upload is async)
    if('closed' === camera.status || 'paused' === camera.status){return;}
  }

  const u8 = frameCvs.getContext("2d").getImageData(0, 0, frameCvs.width, frameCvs.height).data;
  if(!u8.length){console.log('no image');return;}
  let taskID = Dynamsoft.Core.getNextTaskID();
  let stitchImageResult = await new Promise((rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = async(body) => {
      if (body.success) {
        rs(body.response);
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

  checkStitchImageResultError(stitchImageResult);

  // kDebug
  {
    const rsl = camera.currentResolution;
    const image = stitchImageResult?.capturedPanoramaArray?.[0]?.image;
    preDebug.textContent = [
      `${rsl.width}x${rsl.height}`,
      `${image?.width}x${image?.height}`,
      `${frameCount} frame(s)`,
      `algorithm ${stitchImageResult?.timeCost}ms`,
      `total ${Date.now() - timeStart}ms`,
      `memory ${(stitchImageResult?.memory/1024/1024).toFixed(1)}MB`
    ].join('\n');
  }

  return stitchImageResult;
};
// stitchImage for milestone, completely stitch images which were originally intended for future
const dps_stitchImage4Milestone = async(dpsInstanceID)=>{
  const timeStart = Date.now();// kDebug

  let taskID = Dynamsoft.Core.getNextTaskID();
  let stitchImageResult = await new Promise((rs,rj)=>{
    Dynamsoft.Core.mapTaskCallBack[taskID] = async(body) => {
      if (body.success) {
        rs(body.response);
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
        bytes: null,
        width: 0,
        height: 0,
        stride: 0,
        format: 0,
        templateName: ''
      },
      id: taskID,
    });
  });

  checkStitchImageResultError(stitchImageResult);

  // kDebug
  {
    const rsl = camera.currentResolution;
    const image = stitchImageResult?.capturedPanoramaArray?.[0]?.image;
    preDebug.textContent = [
      `${rsl.width}x${rsl.height}`,
      `${image?.width}x${image?.height}`,
      `${frameCount} frame(s)`,
      `algorithm ${stitchImageResult?.timeCost}ms`,
      `total ${Date.now() - timeStart}ms`,
      `memory ${(stitchImageResult?.memory/1024/1024).toFixed(1)}MB`
    ].join('\n');
  }

  return stitchImageResult;
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
const checkStitchImageResultError = (stitchImageResult) => { 
  const capturedPanorama = stitchImageResult.capturedPanoramaArray[0];
  if(capturedPanorama.errorCode){
    console.warn(`errorCode: ${capturedPanorama.errorCode}, errorMessage: ${capturedPanorama.errorString}`);
    let errorString = capturedPanorama.errorString;
    if(capturedPanorama.errorCode <= -20000 && capturedPanorama.errorCode > -30000){
      errorString = errorString || 'License Error';
    }
    throw Error(errorString);
  }
};
const drawResultCanvas = (stitchImageResult, resultCtx)=>{
  const capturedPanorama = stitchImageResult?.capturedPanoramaArray?.[0];
  const image = capturedPanorama?.image;
  const resultCvs = resultCtx?.canvas;

  if(image && resultCvs){
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
};
const drawVideoOverlay = (stitchImageResult, videoOverlayCtx) => {
  const landmarksArray = stitchImageResult?.frameMappedResult?.landmarksArray;
  
  if(videoOverlayCtx && landmarksArray){
    videoOverlayCtx.clearRect(0, 0, videoOverlayCtx.canvas.width, videoOverlayCtx.canvas.height);
    videoOverlayCtx.fillStyle = 'rgba(0,255,0,0.5)';
    videoOverlayCtx.strokeStyle = 'rgba(0,255,0,1)';
    videoOverlayCtx.lineWidth = 1;
    for(let landmark of landmarksArray){
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
};

