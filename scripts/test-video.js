import { chromium } from 'playwright';

async function testCoverVideo() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#catalogueContainer', { timeout: 10000 });
  await page.waitForTimeout(1000);

  const videoData = await page.evaluate(() => {
    const video = document.querySelector('.ecat-video-element');
    const overlay = document.querySelector('.ecat-video-overlay');
    if (!video) return null;
    return {
      src: video.src || video.getAttribute('src'),
      autoplay: video.autoplay,
      muted: video.muted,
      loop: video.loop,
      overlayTop: overlay?.style.top,
      overlayHeight: overlay?.style.height,
      overlayWidth: overlay?.style.width
    };
  });

  console.log('Video Element Data:', videoData);
  const isNewVideo = videoData?.src?.includes('495e8f79-693e-4334-9253-e69101d0eed2');
  console.log('Video is the NEW live video:', isNewVideo ? '✅ YES' : '❌ NO');

  await browser.close();
}

testCoverVideo().catch(console.error);
