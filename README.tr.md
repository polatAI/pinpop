<div align="center">

<img src="frontend/public/icon-192.png" width="88" alt="Pinpop logosu" />

# Pinpop

**Açık kaynak canlı quiz platformu. Quizini oluştur, soruları AI'a yazdır, büyük ekranda canlı oynat.**

Tek komutla kendi sunucunda çalıştır, ya da MCP üzerinden Claude, Cursor ve diğer AI araçlarıyla kullan.

### [▶ pinpop.cloud adresinde ücretsiz dene](https://pinpop.cloud)

Kurulum yok, oyuncular için uygulama da yok. Hesap aç ve ilk oyununu başlat.

[Özellikler](#özellikler) · [Ekran görüntüleri](#ekran-görüntüleri) · [Hızlı başlangıç](#hızlı-başlangıç) · [AI](#ai-ile-soru-üretme) · [MCP](#mcp) · [English](README.md)

[![Canlı](https://img.shields.io/badge/canl%C4%B1-pinpop.cloud-ff3d68)](https://pinpop.cloud)
[![CI](https://github.com/polatAI/pinpop/actions/workflows/ci.yml/badge.svg)](https://github.com/polatAI/pinpop/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-ff3d68)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.13-3776ab)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Socket.IO-009688)](https://fastapi.tiangolo.com)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fpolatai%2Fpinpop-1f9bff)](https://github.com/polatAI/pinpop/pkgs/container/pinpop)
[![MCP](https://img.shields.io/badge/MCP-ready-8b5cf6)](docs/mcp.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-12b886)](CONTRIBUTING.md)

<br />

<img src="docs/screenshots/hero.png" alt="Canlı oyun sırasında Pinpop sunucu ekranı ve bir oyuncunun telefonu" width="100%" />

</div>

---

## Özellikler

**🎮 Canlı oyun**

- Oyuncular 6 haneli PIN veya QR kod ile telefondan katılır. Uygulama ya da hesap gerekmez
- Projeksiyon için ayrı sunucu (host) ekranı, telefonlar için ayrı oyuncu ekranı var
- Hıza göre puanlama, seri (streak) bonusu, canlı sıralama ve animasyonlu podyum
- Bağlantısı kopan oyuncu kaldığı yerden devam eder. Oyun başladıktan sonra katılım isteğe bağlı açılabilir
- Sunucu oyunu kilitleyebilir, oyuncu atabilir, duraklatıp soru atlayabilir, otomatik ilerlemeyi açabilir
- Uygunsuz takma ad filtresi var. İstersen rastgele eğlenceli isimler de verilebilir
- Sesler tarayıcıda sentezlenir, lisans gerektiren ses dosyası yoktur

**📚 Ödev modu:** bir bağlantı paylaş, öğrenciler kendi hızlarında (süreli sorularla, hesapsız) çözsün, sonuçlar raporlarına düşsün

**❓ 8 soru tipi:** quiz (tek cevap) · çoklu seçim · doğru/yanlış · yazarak cevap · sayı tahmini · sıralama · anket · kelime bulutu

**🤖 AI ile soru üretme**

- Konu başlığından, metinden, **web sayfasından** veya **PDF'ten** soru üretir
- Tek bir soruyu zorlaştırır ya da kolaylaştırır, yanlış şıkları iyileştirir, açıklama yazar, yeniden ifade eder
- **Claude (Anthropic)**, **OpenAI**, **OpenRouter**, **Ollama (yerel, ücretsiz)** ve OpenAI uyumlu her API ile çalışır
- Sunucu geneli tek anahtar kullanılabilir, her kullanıcı kendi anahtarını da getirebilir (şifreli saklanır). İstersen günlük limit koyabilirsin

**🔌 MCP ve API**

- `/mcp` adresinde **uzak MCP sunucusu** hazır gelir, ayrıca Python paketiyle birlikte **stdio** komutu `pinpop-mcp` gelir
- Claude'a _"Güneş sistemi hakkında 10 soruluk quiz hazırla ve oyunu başlat"_ de, PIN'i alsın
- `/api/docs` adresinde OpenAPI/Swagger dokümanlı tam REST API ve kişisel API anahtarları

**✏️ Editör ve kütüphane:** sürükle-bırak editör, görsel, süre, çift puan, açıklama. JSON ve CSV/Excel içe-dışa aktarma. Herkese açık quiz kütüphanesi ve kopyalama

**📊 Raporlar:** her oyun kaydedilir. Soru bazında başarı, en zor sorular, oyuncu cevapları ve CSV çıktısı

**🛡️ Kendi sunucunda kurmaya uygun:** tek Docker imajı. Postgres yoksa kurulum gerektirmeyen bir SQLite dosyası kullanılır. İlk kullanıcı yönetici olur. KVKK/GDPR uyumlu veri dışa aktarma ve hesap silme. Takip kodu ya da harici CDN yok. Türkçe ve İngilizce arayüz, karanlık mod ve PWA desteği

## Ekran görüntüleri

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/host-lobby.png" alt="" /><br /><sub><b>Sunucu ekranı:</b> PIN ve QR kodlu lobi</sub></td>
    <td width="50%"><img src="docs/screenshots/host-scoreboard.png" alt="" /><br /><sub>Her sorudan sonra <b>canlı sıralama</b></sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/phones.png" alt="" /><br /><sub><b>Oyuncunun telefonunda:</b> avatar seç, cevapla, sıranı gör</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/editor.png" alt="" /><br /><sub>AI destekli, 8 soru tipli <b>editör</b></sub></td>
    <td><img src="docs/screenshots/discover.png" alt="" /><br /><sub>Herkese açık quizleri <b>keşfet</b> ve kopyala</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/landing.png" alt="" /><br /><sub>Açık tema</sub></td>
    <td><img src="docs/screenshots/landing-dark.png" alt="" /><br /><sub>Koyu tema</sub></td>
  </tr>
</table>

## Hızlı başlangıç

En hızlı yol **[pinpop.cloud](https://pinpop.cloud)** adresindeki barındırılan sürüm: ücretsiz, kurulum gerektirmez. Kendi sunucunda çalıştırmak için:

```bash
git clone https://github.com/polatAI/pinpop.git && cd pinpop
cp .env.example .env        # PUBLIC_URL, APP_SECRET ve POSTGRES_PASSWORD'u ayarla
docker compose up -d
```

<http://localhost:3000> adresini aç ve hesap oluştur. İlk hesap yönetici olur.

Kaynaktan çalıştırmak için Python 3.13 + [uv](https://docs.astral.sh/uv) ve Node.js 22 + pnpm gerekir: `make install && make dev`. Detaylar [docs/self-hosting.md](docs/self-hosting.md) dosyasında.

## AI ile soru üretme

`.env` dosyasına ekle:

```bash
AI_PROVIDER=anthropic     # anthropic | openai | openrouter | ollama | openai-compatible
AI_API_KEY=sk-ant-...
```

Ya da boş bırak, kullanıcılar kendi anahtarlarını **Ayarlar → AI** bölümünden eklesin. Tamamen ücretsiz ve çevrimdışı kullanım için Ollama'yı seç. Detaylar [docs/ai.md](docs/ai.md) dosyasında.

## MCP

**Ayarlar → API & MCP** bölümünden bir anahtar oluştur. Sonra:

```bash
claude mcp add --transport http pinpop https://senin-pinpop-adresin/mcp \
  --header "Authorization: Bearer pp_anahtarin"
```

Claude Desktop ve Cursor yapılandırması için [docs/mcp.md](docs/mcp.md) dosyasına bak.

## Mimari

```
backend/    Python 3.13 · FastAPI · python-socketio · SQLAlchemy + Alembic (PostgreSQL / SQLite)
            Pydantic modelleri, oyun motoru, AI sağlayıcıları (Anthropic SDK, OpenAI uyumlu), MCP sunucusu
frontend/   React 19 · Vite · Tailwind CSS 4 tek sayfalık uygulama (sunucu ekranı, oyuncu, editör, panel)
```

Detaylar [docs/architecture.md](docs/architecture.md) dosyasında.

## Katkı

Her türlü katkıya açığız: hata bildirimi, çeviri, yeni soru tipi, doküman. Başlamak için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasını oku.

## Lisans

[GNU AGPL-3.0](LICENSE). Özgürce kullanabilir, değiştirebilir ve kendi sunucunda çalıştırabilirsin. Değiştirilmiş bir sürümü herkese açık bir hizmet olarak sunarsan değişikliklerini aynı lisansla paylaşman gerekir.

Pinpop bağımsız bir projedir ve herhangi bir ticari quiz platformuyla bağlantısı yoktur.
