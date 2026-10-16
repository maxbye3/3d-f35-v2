const menu = document.querySelector('.download-menu');
const status = document.getElementById('download-status');
const links = [...menu.querySelectorAll('a[download]')];
let busy = false;

for (const link of links) {
  link.addEventListener('click', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const detail = link.querySelector('small');
    const originalDetail = detail.textContent;
    for (const item of links) item.setAttribute('aria-disabled', 'true');
    link.setAttribute('aria-busy', 'true');
    detail.textContent = 'Preparing…';
    status.hidden = false;
    status.textContent = 'Preparing your download…';
    try {
      // Fetch inside the signed-in page: browser download requests can lose
      // the private hosting session. The resulting blob needs no server login.
      const response = await fetch(link.href, { credentials: 'same-origin', redirect: 'error' });
      if (!response.ok) throw new Error(`Download returned ${response.status}`);
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      const filename = decodeURIComponent(new URL(link.href).pathname.split('/').pop());
      const valid = filename.endsWith('.jpg')
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
      if (!valid) throw new Error('The server did not return the requested file');
      const url = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = filename;
      download.hidden = true;
      document.body.append(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      status.textContent = 'Download started.';
    } catch (error) {
      console.error('Export download:', error);
      status.textContent = 'Could not retrieve the file. Refresh the page to reconnect, then try again.';
    } finally {
      busy = false;
      detail.textContent = originalDetail;
      link.removeAttribute('aria-busy');
      for (const item of links) item.removeAttribute('aria-disabled');
    }
  });
}
