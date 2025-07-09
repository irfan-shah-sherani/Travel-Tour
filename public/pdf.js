  async function loadData() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (!token) return alert("Token not found");

    const response = await fetch(`/api/pdf-data?token=${token}`);
    const data = await response.json();

    // Fill dynamic data
    document.getElementById('second_party').innerText = data.second_party || '';
    document.getElementById('qrcode').src = data.qrcode_base64 || data.qrcode_url;
  }

  window.onload = loadData;  async function loadData() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (!token) return alert("Token not found");

    const response = await fetch(`/api/pdf-data?token=${token}`);
    const data = await response.json();

    // Fill dynamic data
    document.getElementById('second_party').innerText = data.second_party || '';
    document.getElementById('qrcode').src = data.qrcode_base64 || data.qrcode_url;
  }

  window.onload = loadData;