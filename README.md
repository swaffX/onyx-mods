<div align="center">

# ◈ Onyx Mods

**Windows oyuncuları için hepsi bir arada mod yöneticisi ve sistem yardımcısı.**

---

[![Version](https://img.shields.io/github/v/release/swaffX/onyx-mods?style=for-the-badge&color=44d62c&label=Sürüm)](https://github.com/swaffX/onyx-mods/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/swaffX/onyx-mods/releases/latest)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/Lisans-Proprietary-ef4444?style=for-the-badge)](./LICENSE)

[🇹🇷 Türkçe](#-türkçe) · [🇬🇧 English](#-english)

</div>

---

## 🇹🇷 Türkçe

**swaffX** tarafından geliştirilen Onyx Mods; oyun kütüphanenizi yönetmenizi, performans artırıcı grafik modlarını kurmanızı ve oyunlarınızı sıkıştırarak disk alanı kazanmanızı sağlayan modern bir Windows masaüstü uygulamasıdır.

### Özellikler

<table>
<tr>
<td width="50%">

**🔍 Oyun Tarama**  
Steam, Epic, GOG, Xbox, EA App ve Ubisoft Connect'ten otomatik oyun tespiti. Kayıt Defteri ve özel klasör desteği dahil.

**⚡ Tek Tıkla Mod Kurulumu**  
DLSS Enabler, OptiScaler, Streamline, OptiPatcher ve FSR4 dosyalarını birkaç tıkla kur, güncelle veya kaldır.

**🖼️ SteamGridDB Entegrasyonu**  
Bulunan oyunlar için otomatik kapak görseli indirir.

**📝 INI Yapılandırma Editörü**  
`OptiScaler.ini` ve `dlss-enabler.ini` dosyalarını doğrudan uygulama içinden düzenle. Preset kaydet ve yükle.

**💾 Akıllı Disk Sıkıştırma**  
XPRESS 4K/8K/16K ve LZX algoritmalarıyla oyunları sıkıştır. Oyunlar oynanabilir kalır, diskte alan açılır. Sıkıştırma geçmişi otomatik kaydedilir.

</td>
<td width="50%">

**🎁 Ücretsiz Oyunlar**  
GamerPower API entegrasyonu ile anlık ücretsiz oyunları takip et. Çevrimdışıyken önbellekli veri gösterilir.

**🖥️ Sistem Bilgisi Paneli**  
GPU, CPU, RAM, Anakart ve Windows sürümü ana sayfada gösterilir. AMD/Intel GPU'larda DLSS uyumsuzluk uyarısı içerir.

**⏱️ Son Oynanma Zamanı**  
Her oyun kartında son oynanma zamanı gösterilir (az önce / X dk / X sa / dün / X gün).

**📊 Ana Sayfa İstatistikleri**  
Toplam kurulu mod, oyun sayısı, sıkıştırılan klasör ve ortalama disk tasarrufu.

**🔄 Otomatik Güncelleme**  
electron-updater ile GitHub Releases üzerinden otomatik güncelleme.

</td>
</tr>
</table>

---

### Desteklenen Grafik Modları

| Mod | Açıklama | Entegrasyon |
|:----|:---------|:------------|
| **DLSS Enabler** | RTX olmayan kartlarda Multi Frame Generation sağlar | Yerel sürüm listesi, otomatik/manuel kurulum, güvenli kaldırma |
| **OptiScaler** | DLSS/FSR/XeSS köprüsü (açık kaynak) | GitHub Releases API, `.7z` indirme, ayıklama ve kurulum |
| **Streamline** | NVIDIA Streamline SDK kütüphaneleri | BFS ile `sl.*.dll` bulma, yedekleme ve hash doğrulamalı geri yükleme |
| **OptiPatcher** | OptiScaler için ek uyumluluk yamaları | GitHub üzerinden otomatik sürüm takibi ve kurulum |
| **FSR4** | FSR4 mod kütüphanesi dosyaları | Harici sunucudan son sürüm çekme |

---

### Sıkıştırma Algoritmaları

| Algoritma | Hız | Oran | Önerilen Kullanım |
|:----------|:----|:-----|:-----------------|
| XPRESS 4K | ⚡⚡⚡ Hızlı | ~21% | Aktif oynanan oyunlar |
| XPRESS 8K | ⚡⚡ Orta | ~25% | Dengeli kullanım |
| XPRESS 16K | ⚡ Yavaş | ~28% | Az oynanan büyük oyunlar |
| LZX | 🐢 En Yavaş | ~35% | Arşiv / nadir oynanan oyunlar |

---

### Kurulum

1. [**Releases**](https://github.com/swaffX/onyx-mods/releases/latest) sayfasından en son `.exe` yükleyicisini indir
2. Çalıştır ve kurulumu tamamla
3. Kur, oyna, optimize et

---

### Geliştirici Kurulumu

**Gereksinimler:** Node.js v18+ · Windows 10/11

```bash
git clone https://github.com/swaffX/onyx-mods.git
cd onyx-mods
npm install

npm start        # Geliştirici modu
npm run build    # Production build → dist/
```

---

### Proje Yapısı

```
onyx-mods/
├── main.js                  # Electron ana süreç
├── preload.js               # Güvenli IPC köprüsü (contextBridge)
├── index.html               # Uygulama arayüzü
├── styles.css               # Tema ve stil (Razer green accent)
├── icons/program_logo.ico   # Çok boyutlu ikon (16/24/32/48/64/256px)
├── nsis/installer.nsh       # Özel NSIS kurulum makroları
├── src/
│   ├── main/
│   │   ├── ipc.js           # IPC kanalları (60+ handler)
│   │   ├── scanner.js       # Çoklu platform oyun tarayıcı
│   │   ├── config.js        # Oyun listesi ve yol yönetimi
│   │   ├── updater.js       # electron-updater entegrasyonu
│   │   └── mods/            # Mod modülleri
│   │       ├── dlssEnabler.js
│   │       ├── optiScaler.js
│   │       ├── streamline.js
│   │       ├── compressor.js
│   │       └── ...
│   └── renderer/
│       ├── index.js         # Renderer başlatıcı
│       ├── i18n/            # Türkçe / İngilizce (600+ anahtar)
│       └── ui/              # Sekme ve modal bileşenleri
└── package.json
```

---

### Lisans

Bu yazılım tescillidir. **swaffX'in** yazılı izni olmaksızın kopyalanamaz, değiştirilemez veya dağıtılamaz.  
© 2026 swaffX. Tüm hakları saklıdır.

Hata bildirimi ve öneriler için [Issues](https://github.com/swaffX/onyx-mods/issues).

---

## 🇬🇧 English

**Onyx Mods** is a modern all-in-one Windows desktop companion developed by **swaffX** for managing your game library, installing performance-boosting graphics mods, and saving disk space through compression.

### Features

<table>
<tr>
<td width="50%">

**🔍 Game Scanning**  
Auto-detects games from Steam, Epic, GOG, Xbox, EA App, and Ubisoft Connect. Also supports Registry and custom folder scanning.

**⚡ One-Click Mod Installation**  
Install, update, and remove DLSS Enabler, OptiScaler, Streamline, OptiPatcher, and FSR4 in a few clicks.

**🖼️ SteamGridDB Integration**  
Automatically downloads cover artwork for detected games.

**📝 INI Config Editor**  
Edit `OptiScaler.ini` and `dlss-enabler.ini` directly inside the app. Save and load presets.

**💾 Smart Disk Compression**  
Compress game folders with XPRESS 4K/8K/16K and LZX. Games stay fully playable. Compression history is automatically logged.

</td>
<td width="50%">

**🎁 Free Games**  
Track free games and giveaways in real time via GamerPower API. Shows cached data when offline.

**🖥️ System Info Panel**  
Displays GPU, CPU, RAM, Motherboard, and Windows version on the home page. Includes DLSS compatibility warning for AMD/Intel GPUs.

**⏱️ Last Played Timestamps**  
Each game card shows when it was last launched (just now / X min / X hr / yesterday / X days).

**📊 Home Page Stats**  
Total installed mods, game count, compressed folders, and average disk savings.

**🔄 Auto-Update**  
Automatic updates via electron-updater and GitHub Releases.

</td>
</tr>
</table>

---

### Supported Graphics Mods

| Mod | Description | Integration |
|:----|:------------|:------------|
| **DLSS Enabler** | Enables Multi Frame Generation on non-RTX cards | Local version listing, auto/manual install, safe removal |
| **OptiScaler** | Open-source DLSS/FSR/XeSS bridge | GitHub Releases API, `.7z` download, extraction and install |
| **Streamline** | NVIDIA Streamline SDK libraries | BFS-based `sl.*.dll` locator, backup and hash-verified restore |
| **OptiPatcher** | Additional compatibility patches for OptiScaler | Auto version tracking and install via GitHub |
| **FSR4** | FSR4 mod library files | Latest file fetch from external server |

---

### Installation

1. Download the latest `.exe` installer from the [**Releases**](https://github.com/swaffX/onyx-mods/releases/latest) page
2. Run and complete the installation

---

### Developer Setup

**Requirements:** Node.js v18+ · Windows 10/11

```bash
git clone https://github.com/swaffX/onyx-mods.git
cd onyx-mods
npm install

npm start        # Developer mode
npm run build    # Production build → dist/
```

---

### License

This software is proprietary. Copying, modification, or distribution without **swaffX's** written permission is strictly prohibited.  
© 2026 swaffX. All rights reserved.

Report bugs and suggestions via [Issues](https://github.com/swaffX/onyx-mods/issues).

---

<div align="center">
Made with ❤️ by <a href="https://github.com/swaffX">swaffX</a>
</div>
