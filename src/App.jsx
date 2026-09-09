import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, getDocs, collection, onSnapshot, query, where, limit, orderBy, deleteDoc, arrayUnion, waitForPendingWrites, enableNetwork, disableNetwork, getDocFromServer, getDocsFromCache, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { sembolTahsilatGonder } from './sembolKoprusu';
import { sembolTahsilatSil } from './sembolKoprusu'; // YENİ: Sembol'den kayıt silme (mevcut import satırı değiştirilmedi)
import Depo from './depo';
import Odeme from './odeme';
import Musteri from './musteri';
import Finans from './finans';
import { 
  LayoutDashboard, 
  Users, 
  Eye,
  Calendar,
  Clock, 
  AlertCircle, 
  Box,
  Settings,
  UserCog, 
  Shield,
  Menu,
  Search,
  Bell,
  ChevronDown,
  X,
  Plus,
  Upload,
  Trash2,
  Edit,
  Home,
  ArrowLeft,
  Wallet,
  LogOut,
  TrendingUp,
  RefreshCcw,
  MoveHorizontal,
  MoveVertical,
  MoveDiagonal,
  Columns,
  MessageCircle,
  Phone,
  FileText as FileTextIcon,
  History,
  Download,
  Info,
  Key,
  Check,
  Gift,
  MapPin,
  Lock,
  LogIn,
  Camera,
  Image as ImageIcon
} from 'lucide-react';

// ============================================================================
// 🗄️ FIREBASE ENTEGRASYON HAZIRLIĞI VE YAPILANDIRMASI (CANLI)
// ============================================================================
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// ═══════════════════════════════════════════════════════════════════════════
// YENİ EKLENEN: GÜVENLİ FIREBASE BAŞLATMA (BEYAZ EKRAN KORUMASI)
// SORUN: initializeApp doğrudan çağrıldığında, Vercel'de VITE_FIREBASE_*
// ortam değişkenleri tanımlı değilse apiKey undefined kalır ve Firebase
// modül yüklenirken HATA FIRLATIR. React hiç render edilemez → BEYAZ EKRAN.
// ÇÖZÜM: Config doğrulanır ve başlatma try/catch içine alınır. Eksik/hatalı
// yapılandırmada uygulama çökmez; auth/db null kalır (kod bunu zaten destekler,
// her yerde "if (db && firebaseUser)" kontrolü var) ve konsola uyarı yazılır.
// ═══════════════════════════════════════════════════════════════════════════
let app = null;
let auth = null;
let db = null;

// Zorunlu alanlar dolu mu? (Vercel > Settings > Environment Variables)
const __fbConfigValid = Boolean(
    firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

if (__fbConfigValid) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        // ═══════════════════════════════════════════════════════════════════
        // OKUMA OPTİMİZASYONU #1 (EN BÜYÜK KAZANÇ): KALICI YEREL ÖNBELLEK
        // Önceden her sayfa yenilemede/uygulama açılışında TÜM koleksiyonlar
        // (müşteriler, odalar, randevular...) Firestore'dan BAŞTAN indiriliyordu
        // → her açılış binlerce okuma. IndexedDB kalıcı önbelleği ile veriler
        // tarayıcıda saklanır; yeniden açılışta dinleyiciler kaldığı yerden devam
        // eder ve SADECE DEĞİŞEN dokümanlar okunur (faturalanır).
        // persistentMultipleTabManager: birden çok sekme açıkken de çalışır.
        // ═══════════════════════════════════════════════════════════════════
        try {
            db = initializeFirestore(app, {
                localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
            });
        } catch (cacheErr) {
            // Tarayıcı IndexedDB desteklemiyorsa normal (önbelleksiz) modda devam et
            console.warn('Kalıcı önbellek açılamadı, standart mod:', cacheErr);
            db = getFirestore(app);
        }
    } catch (err) {
        // Hatalı anahtar/yapılandırma → uygulama yine de açılır (offline/önizleme modu)
        console.error('Firebase başlatılamadı, uygulama offline modda çalışıyor:', err);
        app = null; auth = null; db = null;
    }
} else {
    console.warn(
        '[DepoEvim] Firebase ortam değişkenleri eksik. Uygulama VERİTABANI OLMADAN açıldı.\n' +
        'Vercel > Project > Settings > Environment Variables bölümüne şunları ekleyin:\n' +
        'VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,\n' +
        'VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID\n' +
        'Not: Bu değişkenler BUILD sırasında koda gömülür — ekledikten sonra REDEPLOY şart.'
    );
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'depoevim-crm';

// YENİ: Bu ay (monthCounter: girişten itibaren 0,1,2...) hediye kapsamında mı?
// Hediye artık her zaman İLK aylardan değil, hediyenin verildiği SÖZLEŞME YILININ
// ilk aylarından başlar. giftStartMonthIndex hediye verilirken kaydedilir
// (örn. 3. yıl dolduysa 36). Eski kayıtlarda bu alan yoktur (0) → eski davranış korunur.
const isGiftedMonth = (roomLike, monthCounter) => {
    if (!roomLike || !roomLike.giftMonths) return false;
    const start = Number(roomLike.giftStartMonthIndex || 0);
    return monthCounter >= start && monthCounter < start + Number(roomLike.giftMonths);
};

// ============================================================================
// 🧠 ÖNİZLEME İÇİN BELLEK-İÇİ (IN-MEMORY) SAKLAMA
// ============================================================================
// Artifact/önizleme ortamında localStorage desteklenmediği için "Beni Hatırla"
// özelliği burada basit bir bellek-içi obje ile simüle edilmiştir. Canlı ortamda
// (gerçek tarayıcıda) bu kısım tekrar localStorage ile değiştirilebilir.
const mockSessionStore = {};

// YENİ EKLENEN: Kalıcı saklama yardımcısı.
// Canlı ortamda gerçek localStorage kullanılır (sayfa yenilense de kalır);
// önizleme sandbox'ında localStorage erişilemezse otomatik olarak bellek-içi
// mockSessionStore'a düşer (try/catch ile korunur, önizleme çökmez).
const persistStore = {
    set: (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { mockSessionStore[k] = v; } },
    get: (k) => { try { const v = window.localStorage.getItem(k); return v !== null && v !== undefined ? v : (mockSessionStore[k] || null); } catch (e) { return mockSessionStore[k] || null; } },
    remove: (k) => { try { window.localStorage.removeItem(k); } catch (e) {} delete mockSessionStore[k]; }
};

// YENİ EKLENEN: İndirilen/yazdırılan PDF'in dosya adını müşteri adına göre ayarlar.
// Tarayıcılar "PDF olarak kaydet" veya paylaşımda sayfa başlığını (document.title) dosya adı
// olarak kullanır. Yazdırma sırasında ana başlığı geçici olarak müşteri adı yapıp sonra eski
// haline döndürürüz. Dosya adında sorun çıkmaması için özel karakterler temizlenir.
const sanitizePdfName = (name) => {
    let s = String(name || 'Belge').trim();
    s = s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    return s || 'Belge';
};
let __prevDocTitle = null;
const setPdfFileName = (name) => {
    try {
        if (__prevDocTitle === null) __prevDocTitle = document.title;
        document.title = sanitizePdfName(name);
        // Yazdırma bittikten sonra eski başlığı geri koy
        const restore = () => { if (__prevDocTitle !== null) { document.title = __prevDocTitle; __prevDocTitle = null; } window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        setTimeout(restore, 90000);
    } catch (e) {}
};
// ============================================================================

// YENİ EKLENEN: Yazdırma/PDF dosya adını müşteri adına göre ayarlar.
// Tarayıcılar "PDF olarak kaydet"te document.title'ı dosya adı olarak kullanır.
// Yazdırma öncesi ana başlığı geçici olarak müşteri adı + belge tipine çevirir,
// yazdırma bitince (afterprint) eski başlığa döner.
const dokumanDosyaAdi = (adSoyad, belgeTuru) => {
    let ad = (adSoyad || 'Musteri').toString().trim();
    // Türkçe karakterleri sadeleştir, boşlukları alt çizgi yap
    ad = ad.toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    const tur = (belgeTuru || 'belge').toString()
        .toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    return `musteri_${ad || 'musteri'}_${tur || 'belge'}`;
};

const setPrintFileName = (adSoyad, belgeTuru) => {
    // Kullanıcı isteği: PDF dosya adı = müşterinin adı soyadı (belge türü/ön ek olmadan)
    setPdfFileName(adSoyad || 'Belge');
};
// ============================================================================

// --- YARDIMCI FONKSİYONLAR ---
const normalizeStr = (str) => {
    if (!str) return '';
    return str.toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
};

// Mini grafik bileşeni
// ============================================================================

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 KÖK NEDEN VE ÇÖZÜMÜ: MOBİLDE KAYITLARIN SUNUCUYA ULAŞMAMASI
// SORUN: upload.php erişilemezse (CORS/sunucu kapalı) dosya BASE64'e çevrilip
// doğrudan Firestore dokümanına yazılıyordu. Firestore'un DOKÜMAN BAŞINA
// KESİN SINIRI 1 MiB'dir. Telefon kamerasıyla çekilen fotoğraf 3–8 MB olur,
// base64'e çevrilince ~%33 daha büyür (4–11 MB) → doküman sınırı KATİ ŞEKİLDE
// AŞILIR → yazma sunucuda KALICI OLARAK REDDEDİLİR / kuyrukta takılır.
// Sonuç: kaydı giren kişi (yerel önbellekten) görür, DİĞERLERİ ASLA GÖREMEZ.
// Masaüstünden küçük dosya ekleyenlerde sınır aşılmadığı için sorun çıkmıyordu.
// "Tekrar Yükle" de işe yaramıyordu: yazma geçersiz olduğu için kaç kez
// gönderilse de sunucu kabul etmiyor.
// ÇÖZÜM: Base64'e düşmeden ÖNCE görsel canvas ile küçültülüp sıkıştırılır
// (uzun kenar 1600px, JPEG kalite kademeli düşürülerek hedef ~600 KB altı).
// Böylece doküman 1 MiB sınırının altında kalır ve yazma sunucuya ULAŞIR.
// ═══════════════════════════════════════════════════════════════════════════

// Firestore doküman sınırı 1 MiB; medya için güvenli üst sınır (diğer alanlara pay bırakır)
const MEDIA_MAX_BYTES = 600 * 1024;

// data URL'in yaklaşık byte boyutu (base64 → ham byte)
const dataUrlBytes = (dataUrl) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return 0;
    const b64 = dataUrl.split(',')[1] || '';
    return Math.floor(b64.length * 0.75);
};

// Bir görsel data URL'ini canvas ile küçültüp hedef boyutun altına indirir.
// Kalite kademeli düşürülür; yetmezse boyut da küçültülür. Video ise dokunulmaz (null döner).
const shrinkImageDataUrl = (dataUrl, maxBytes = MEDIA_MAX_BYTES, maxEdge = 1600) => {
    return new Promise((resolve) => {
        if (!dataUrl || !String(dataUrl).startsWith('data:image')) { resolve(null); return; }
        const img = new Image();
        img.onload = () => {
            try {
                let edge = maxEdge;
                // Kalite ve boyutu sırayla düşürerek hedefin altına inmeye çalış
                for (let pass = 0; pass < 6; pass++) {
                    const scale = Math.min(1, edge / Math.max(img.width, img.height));
                    const w = Math.max(1, Math.round(img.width * scale));
                    const h = Math.max(1, Math.round(img.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const qualities = [0.7, 0.55, 0.4];
                    for (const q of qualities) {
                        const out = canvas.toDataURL('image/jpeg', q);
                        if (dataUrlBytes(out) <= maxBytes) { resolve(out); return; }
                    }
                    edge = Math.round(edge * 0.7); // hâlâ büyükse çözünürlüğü daha da düşür
                }
                // 6 denemede de inemediyse en agresif hâlini döndür (yine de sınırın çok altında olur)
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 640 / Math.max(img.width, img.height));
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.4));
            } catch (e) { console.error('Görsel küçültme hatası:', e); resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
};

// Dosyayı (File) base64 data URL'e çevirir
const fileToDataUrl = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
});

// --- RESİM/DOSYA YÜKLEME YARDIMCI FONKSİYONU ---
const uploadImageToServer = async (file) => {
    if (!file) return null;
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        // İstenen yükleme adresi (Sunucudaki upload.php endpoint'iniz)
        const response = await fetch('https://www.depoevim.com/crm/upload.php', {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            const data = await response.json();
            if (data.url) {
                // YENİ EKLENEN: Eğer PHP dosyası sadece "uploads/resim.jpg" gibi yarım bir link dönüyorsa başına site adresini ekle
                return data.url.startsWith('http') ? data.url : `https://www.depoevim.com/crm/${data.url}`;
            }
        }
    } catch (error) {
        console.warn('Sunucuya yüklenemedi (API yok veya CORS hatası), Base64 olarak devam ediliyor.', error);
    }
    
    // ───────────────────────────────────────────────────────────────────────
    // Sunucu başarısız → Base64'e düşülür. ARTIK HAM HALDE DEĞİL:
    // Görseller Firestore 1 MiB sınırının altına inecek şekilde sıkıştırılır.
    // Videolar sıkıştırılamaz; sınırı aşan video Firestore'a YAZILAMAZ, bu yüzden
    // sessizce kaybolmasın diye kullanıcı UYARILIR ve o dosya atlanır.
    // ───────────────────────────────────────────────────────────────────────
    const rawDataUrl = await fileToDataUrl(file);
    if (!rawDataUrl) return null;

    const isVideo = String(file.type || '').startsWith('video');
    if (isVideo) {
        if (dataUrlBytes(rawDataUrl) > MEDIA_MAX_BYTES) {
            // Sınırı aşan video: yazma kalıcı olarak reddedilirdi → kaydın tamamı sunucuya gitmezdi.
            alert(
                'UYARI: Seçilen VİDEO çok büyük olduğu için sunucuya kaydedilemez ve bu yüzden EKLENMEDİ.\n\n' +
                'Kaydın geri kalanı (oda/müşteri bilgileri) normal şekilde kaydedilecek ve tüm kullanıcılar görecek.\n' +
                'Video yerine FOTOĞRAF ekleyin; fotoğraflar otomatik küçültülerek sorunsuz kaydedilir.'
            );
            return null;
        }
        return rawDataUrl; // küçük video → sorunsuz
    }

    // Görsel: sınırın altındaysa bile mobil kamera dosyaları için küçültmek faydalı
    if (dataUrlBytes(rawDataUrl) <= MEDIA_MAX_BYTES) return rawDataUrl;
    const shrunk = await shrinkImageDataUrl(rawDataUrl, MEDIA_MAX_BYTES);
    if (shrunk) return shrunk;

    // Küçültme mümkün olmadıysa (bozuk dosya vb.) ham veriyi YAZMA — kaydı zehirlemesin
    alert('UYARI: Seçilen dosya işlenemedi ve çok büyük olduğu için eklenmedi. Kaydın geri kalanı normal kaydedilecek.');
    return null;
};

// Mini grafik bileşeni
const Sparkline = ({ data, color }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 40;
  const width = 100;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height * 0.8 - height * 0.1;
    return `${x},${y}`;
  }).join(' L ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={`M ${points}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  // YENİ: İlk açılışta Firebase verileri gelene kadar "Yükleniyor" splash ekranı gösterilir.
  const [appDataReady, setAppDataReady] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  // YENİ EKLENEN: Gösterge Paneli kartlarına tıklayınca açılan detay penceresi
  // type: 'newCustomers' | 'exitedCustomers' | 'enteredRooms' | 'exitedRooms' | 'overdueMovements'
  const [dashboardDetail, setDashboardDetail] = useState(null); // { type, title }
  const [dashboardDetailFilter, setDashboardDetailFilter] = useState('today'); // today | yesterday | week | month | year | all
  const [dashboardDetailShowAll, setDashboardDetailShowAll] = useState(false);
  // YENİ: Gösterge Paneli genel zaman filtresi — kartlardaki toplam sayılar bu aralığa göre hesaplanır
  const [dashboardRange, setDashboardRange] = useState('today'); // today | yesterday | week | month | year | all

  // --- YENİ EKLENEN: OTOMATİK GÜNCELLEME ---
  // Tüm cari borç ve oda borçlandırma hesapları (getCustomerLedger) her render'da bugünün tarihine göre
  // yeniden hesaplanır. Bu tick her dakika artarak bileşeni periyodik yeniden render eder; böylece
  // gün/ay değişimleri ve yeni borçlandırmalar herhangi bir butona basmadan otomatik güncel kalır.
  const [autoRefreshTick, setAutoRefreshTick] = useState(0);
  useEffect(() => {
      const interval = setInterval(() => {
          setAutoRefreshTick(t => t + 1);
      }, 60000); // her 60 saniyede bir otomatik yenile
      return () => clearInterval(interval);
  }, []);
  // YENİ: Sayfa (menü) veya görüntülenen müşteri değiştiğinde de anında güncel hesap için yeniden render tetikle
  useEffect(() => {
      setAutoRefreshTick(t => t + 1);
  }, [activeMenu, selectedCustomerId]);

// --- YENİ EKLENEN: MOBİL UYUMLULUK VE TAM EKRAN (VIEWPORT) AYARI ---
  useEffect(() => {
      // DÜZELTİLDİ: Bu ayar önceden HER ZAMAN uygulanıyordu; bu da masaüstünde/önizlemede
      // sayfanın zorla mobil genişlikte (device-width) açılmasına ve mobil görünüm gibi
      // render edilmesine sebep oluyordu. Artık yalnızca gerçek mobil cihazlarda (dokunmatik +
      // dar ekran) uygulanır; masaüstü tarayıcı ve önizleme araçlarında normal masaüstü
      // görünümü (varsayılan viewport) korunur.
      const isRealMobileDevice = typeof window !== 'undefined' && window.innerWidth < 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

      // Tarayıcıya uygulamanın mobil cihazın kendi çözünürlüğünde çalışması gerektiğini söylüyoruz
      let meta = document.querySelector('meta[name="viewport"]');
      if (isRealMobileDevice) {
          if (!meta) {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              document.head.appendChild(meta);
          }
          // initial-scale=1.0 ve user-scalable=0 ile uzaklaştırma/yakınlaştırma ihtiyacını ortadan kaldırır
          meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0';
      } else if (meta) {
          // Masaüstü/önizleme: zorlanmış mobil viewport'u kaldır, tarayıcının varsayılanı geçerli olsun
          meta.content = 'width=device-width, initial-scale=1.0';
      }
      
      // --- YENİ EKLENEN: Hotlink (Referrer) Korumasını Aşmak İçin ---
      // Resimler link olarak açılıp uygulama içinde görünmüyorsa bu ayar onu çözer.
      let metaReferrer = document.querySelector('meta[name="referrer"]');
      if (!metaReferrer) {
          metaReferrer = document.createElement('meta');
          metaReferrer.name = 'referrer';
          document.head.appendChild(metaReferrer);
      }
      metaReferrer.content = 'no-referrer';
      // --------------------------------------------------------------

      // Yatay kaymaları tamamen engellemek için genel stiller
      document.body.style.overflowX = 'hidden';
      document.documentElement.style.overflowX = 'hidden';
      
      return () => {
          document.body.style.overflowX = '';
          document.documentElement.style.overflowX = '';
      };
  }, []);
  // ------------------------------------------------------------------

  // ============================================================================
  // 🗄️ FIREBASE VERİ SENKRONİZASYONU (DATA STORE)
  // ============================================================================
  // Firebase'e bağlandığında, burası tüm uygulamanın verilerinin çekildiği ve 
  // dinlendiği ana merkez olacaktır. Data eklemeye / eşleştirmeye buradan başlayabilirsiniz.
  
const [firebaseUser, setFirebaseUser] = useState(null);
  // ═══════════════════════════════════════════════════════════════════
  // YENİ EKLENEN: SENKRONİZASYON BEKÇİSİ (GÖRÜNMEZ KAYIT ENGELİ TESPİTİ)
  // SORUN: Firestore SDK'sı her kaydı ÖNCE cihazın yerel önbelleğine yazar;
  // kullanıcı kaydı kendi ekranında ANINDA görür. Ama kayıt sunucuya hiç
  // ulaşamazsa (oturum token'ı düşmesi, ağın Firestore kanalını engellemesi,
  // güvenlik kuralı reddi vb.) yerel kuyrukta sonsuza dek bekler → kaydı
  // giren kişi görür, DİĞER KULLANICILAR GÖREMEZ ve kimse fark etmez.
  // ÇÖZÜM: Bekleyen yazmalar periyodik kontrol edilir. 15 sn içinde sunucuya
  // ulaşmayan kayıt varsa ekranın üstünde KIRMIZI UYARI ŞERİDİ çıkar ve
  // arka planda oturum tazelenerek kuyruğun akması sağlanır. Kuyruk
  // boşalınca uyarı otomatik kaybolur. Mevcut kayıt fonksiyonlarına
  // DOKUNULMAMIŞTIR — bekçi tamamen bağımsız çalışır.
  // ═══════════════════════════════════════════════════════════════════
  const [syncBlocked, setSyncBlocked] = useState(false);
  const [syncRetrying, setSyncRetrying] = useState(false);   // "Tekrar Yükle" butonu çalışıyor mu?
  const [syncRetryMsg, setSyncRetryMsg] = useState('');      // Kullanıcıya gösterilen deneme sonucu
  const [syncPendingCount, setSyncPendingCount] = useState(0); // Sunucuya ulaşmayı bekleyen kayıt sayısı

  // ═══════════════════════════════════════════════════════════════════════
  // YENİ MODÜL: ŞUBE KONTROL KAYITLARI (Temizlik / İlaçlama / Genel Kontrol)
  // Her şube için periyodik bakım kayıtları burada tutulur. Kayıtlar şube
  // bazlıdır (warehouseId), geçmişe dönük listelenir ve nota açıktır.
  // ═══════════════════════════════════════════════════════════════════════
  const [inspections, setInspections] = useState([]);              // tüm kontrol kayıtları
  const [inspectionWarehouseId, setInspectionWarehouseId] = useState(null); // hangi şubenin sayfası açık
  // inspectionTypeFilter / isInspectionModalOpen / inspectionForm / inspectionTypes → src/depo.jsx içine taşındı.
  useEffect(() => {
      if (!db || !auth) return;
      let cancelled = false;
      // ─────────────────────────────────────────────────────────────────
      // DÜZELTİLDİ (KUSUR 1 — YANLIŞ ALARM): Eskiden yalnızca
      // waitForPendingWrites'ın 15 sn'de dönmemesine bakılıyordu. Bu; büyük bir
      // fotoğraf yüklenirken, tünelden geçerken ya da anlık kopmada bile
      // "kayıtlar ULAŞMIYOR" alarmını yakıyordu — oysa bekleyen HİÇBİR kayıt
      // olmayabiliyordu. Artık ÖNCE yerel önbellekten gerçekten sunucu onayı
      // beklemekte olan doküman var mı diye bakılır (ücretsiz, yerel okuma).
      // Bekleyen kayıt yoksa alarm ASLA yanmaz.
      // ─────────────────────────────────────────────────────────────────
      const checkSync = async () => {
          try {
              const pend = await collectPendingDocs();
              if (cancelled) return;
              setSyncPendingCount(pend.length);
              if (pend.length === 0) { setSyncBlocked(false); return; } // bekleyen yok → sorun yok

              // Bekleyen kayıt var: sunucuya ulaşması için makul süre tanınır.
              const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('SYNC_TIMEOUT')), 15000));
              await Promise.race([waitForPendingWrites(db), timeout]);
              if (!cancelled) { setSyncBlocked(false); setSyncPendingCount(0); }
          } catch (e) {
              if (cancelled) return;
              setSyncBlocked(true); // kayıtlar sunucuya ULAŞMIYOR → kullanıcıyı uyar
              console.error('SENKRON ENGELİ: Yerel kayıtlar sunucuya yazılamıyor.', e);
              // Onarım denemesi: oturum düştüyse arka planda yeniden aç (kuyruk otomatik akar)
              try { if (!auth.currentUser) await signInAnonymously(auth); } catch (err) { console.error('Oturum tazeleme hatası:', err); }
          }
      };
      checkSync(); // açılışta hemen kontrol (önceki oturumdan kalan takılı kayıtlar için)
      const interval = setInterval(checkSync, 30000); // sonra her 30 sn'de bir
      return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // YENİ EKLENEN: "TEKRAR YÜKLE" — TAKILI KAYITLARI ELLE SUNUCUYA GÖNDERME
  // Bekleyen kayıtlar Firestore'un YEREL KUYRUĞUNDA durur; kuyruk kaybolmaz,
  // sadece akmıyordur. Bu buton kuyruğu zorla akıtmak için sırayla dener:
  //   1) Oturum kontrolü — düşmüşse yeniden açılır (yetkisiz yazma reddedilir).
  //   2) Ağ bağlantısı KAPATILIP AÇILIR (disableNetwork → enableNetwork):
  //      Firestore'un takılı kalan sunucu kanalını sıfırlar; yeniden bağlanınca
  //      SDK bekleyen tüm yazmaları kendisi baştan gönderir. Takılmayı çözen ana adım.
  //   3) waitForPendingWrites ile kuyruğun GERÇEKTEN boşaldığı doğrulanır (20 sn).
  // Kayıt verileri bu süreçte ASLA silinmez/değiştirilmez — sadece yeniden gönderilir.
  // ═══════════════════════════════════════════════════════════════════
  // Bir oda/müşteri nesnesindeki TÜM medya alanlarını 1 MiB sınırının altına indirir.
  // Görseller sıkıştırılır; sıkıştırılamayan (video/bozuk) ve sınırı aşan alanlar
  // dokümandan çıkarılır — böylece kaydın KENDİSİ sunucuya ulaşır ve herkes görür.
  const shrinkRecordMedia = async (obj) => {
      let changed = false;
      let droppedVideo = 0;
      const fix = async (val) => {
          if (typeof val === 'string' && val.startsWith('data:') && dataUrlBytes(val) > MEDIA_MAX_BYTES) {
              if (val.startsWith('data:image')) {
                  const s = await shrinkImageDataUrl(val, MEDIA_MAX_BYTES);
                  if (s) { changed = true; return s; }
              }
              changed = true; droppedVideo++;
              return null; // sıkıştırılamayan büyük medya (video) çıkarılır
          }
          if (Array.isArray(val)) {
              const out = [];
              for (const item of val) out.push(await fix(item));
              return out;
          }
          if (val && typeof val === 'object') {
              const out = {};
              for (const k of Object.keys(val)) out[k] = await fix(val[k]);
              return out;
          }
          return val;
      };
      const fixed = await fix(obj);
      return { fixed, changed, droppedVideo };
  };

  // ═══════════════════════════════════════════════════════════════════════
  // YENİ EKLENEN: REST API İLE DOĞRUDAN YAZMA (SDK KUYRUĞUNU BAYPAS EDER)
  // ASIL SORUN BUYDU: "Tekrar Yükle" çalışmıyordu çünkü tüm yazmalar (onarılmış
  // olanlar dahil) Firestore SDK'sının AYNI YEREL KUYRUĞUNA giriyordu. Kuyruğun
  // başındaki bir kayıt kilitlendiğinde arkasındaki her şey de bekler —
  // disableNetwork/enableNetwork bile bunu açmaz, çünkü sorun ağ değil kuyruktur.
  // ÇÖZÜM: Kayıtları SDK'yı hiç kullanmadan, doğrudan Firestore REST API'sine
  // HTTPS isteğiyle yazmak. Bu yol kuyruğa girmez, anında sonuç döner ve
  // başarısızlıkta GERÇEK hata mesajını (yetki reddi / boyut aşımı / ağ) verir.
  // ═══════════════════════════════════════════════════════════════════════

  // JS nesnesini Firestore REST'in beklediği tipli formata çevirir.
  const toFsValue = (v) => {
      if (v === null || v === undefined) return { nullValue: null };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (typeof v === 'number') {
          if (!isFinite(v)) return { nullValue: null };
          return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      }
      if (typeof v === 'string') return { stringValue: v };
      if (Array.isArray(v)) {
          // NOT: Firestore dizi içinde dizi kabul etmez; böyle bir alan metne çevrilir.
          return { arrayValue: { values: v.map(item => Array.isArray(item) ? { stringValue: JSON.stringify(item) } : toFsValue(item)) } };
      }
      if (typeof v === 'object') {
          const fields = {};
          Object.keys(v).forEach(k => { fields[k] = toFsValue(v[k]); });
          return { mapValue: { fields } };
      }
      return { stringValue: String(v) };
  };

  // Tek bir dokümanı REST ile yazar (merge davranışı için updateMask kullanılır).
  // Dönüş: { ok: true } veya { ok: false, code, message }
  const restPatchDoc = async (colName, docId, data, idToken) => {
      const projectId = firebaseConfig.projectId;
      const payload = { ...data };
      delete payload.id; // doküman kimliği alan olarak yazılmaz
      // DÜZELTİLDİ (KUSUR 3): undefined/fonksiyon alanları REST'i 400 ile reddettiriyordu.
      Object.keys(payload).forEach(k => { if (payload[k] === undefined || typeof payload[k] === 'function') delete payload[k]; });
      const keys = Object.keys(payload);
      if (keys.length === 0) return { ok: true };

      const fields = {};
      keys.forEach(k => { fields[k] = toFsValue(payload[k]); });

      // Sadece gönderdiğimiz alanlar güncellenir (merge:true karşılığı) — diğer alanlar silinmez.
      // DÜZELTİLDİ (KUSUR 3): Basit olmayan alan adları (nokta, tire, boşluk, sayıyla başlayan)
      // Firestore fieldPath sözdiziminde TERS TIRNAK içine alınmalıdır; alınmazsa istek
      // "Invalid field path" ile 400 döner ve yükleme sessizce başarısız olurdu.
      const quotePath = (k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k.replace(/`/g, '\\`') + '`';
      const mask = keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(quotePath(k))}`).join('&');
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/` +
                  `artifacts/${appId}/public/data/${colName}/${encodeURIComponent(String(docId))}?${mask}`;
      try {
          const res = await fetch(url, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
              body: JSON.stringify({ fields })
          });
          if (res.ok) return { ok: true };
          const errBody = await res.json().catch(() => ({}));
          const msg = errBody?.error?.message || `HTTP ${res.status}`;
          return { ok: false, code: res.status, message: msg };
      } catch (e) {
          return { ok: false, code: 0, message: e?.message || 'Ağ hatası' };
      }
  };

  // Dokümanın sunucuda GERÇEKTEN var olduğunu REST ile doğrular (önbellek karışmaz).
  const restDocExists = async (colName, docId, idToken) => {
      const projectId = firebaseConfig.projectId;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/` +
                  `artifacts/${appId}/public/data/${colName}/${encodeURIComponent(String(docId))}`;
      try {
          const res = await fetch(url, { headers: { 'Authorization': `Bearer ${idToken}` } });
          return res.ok;
      } catch (e) { return false; }
  };

  // Sunucuya ulaşmamış (yerel kuyrukta bekleyen) kayıtları önbellekten toplar.
  // metadata.hasPendingWrites: o dokümanın SUNUCU ONAYI ALMAMIŞ yerel değişikliği var demektir.
  // İşte "sadece kendi telefonunda görünen" kayıtlar tam olarak bunlardır.
  const SYNC_COLLECTIONS = ['rooms', 'customers', 'appointments', 'reminders', 'pendingCollections', 'blocks', 'warehouses'];
  const collectPendingDocs = async () => {
      const out = [];
      for (const colName of SYNC_COLLECTIONS) {
          try {
              const snap = await getDocsFromCache(collection(db, 'artifacts', appId, 'public', 'data', colName));
              snap.docs.forEach(d => {
                  if (d.metadata.hasPendingWrites) out.push({ colName, id: d.id, data: d.data() });
              });
          } catch (e) { console.warn(`Önbellek okunamadı (${colName}):`, e); }
      }
      return out;
  };

  const handleRetrySync = async () => {
      if (!db || syncRetrying) return;
      setSyncRetrying(true);
      let totalRepaired = 0, totalDroppedVideo = 0;
      try {
          // 1) Oturum yoksa aç — oturumsuz yazma Firestore kuralları tarafından reddedilir
          if (auth && !auth.currentUser) {
              setSyncRetryMsg('Oturum yenileniyor...');
              await signInAnonymously(auth);
          }

          // ─────────────────────────────────────────────────────────────────
          // 2) ASIL ÇÖZÜM: SINIRI AŞAN KAYITLARI ONAR
          // Takılan yazmaların sebebi ağ değil, dokümanın 1 MiB sınırını aşmasıdır.
          // Bu yüzden yalnızca "yeniden göndermek" işe yaramıyordu. Burada büyük
          // medya içeren oda/müşteri kayıtları küçültülerek YENİDEN yazılır;
          // küçülen doküman sunucu tarafından kabul edilir ve herkes görür.
          // ─────────────────────────────────────────────────────────────────
          setSyncRetryMsg('Sunucuya sığmayan kayıtlar taranıyor...');
          // Doküman boyutu ölçümü: JSON uzunluğu, Firestore doküman boyutuna iyi bir yaklaşımdır.
          const docTooBig = (o) => { try { return JSON.stringify(o).length > MEDIA_MAX_BYTES; } catch (e) { return false; } };
          const oversizedRooms = (rooms || []).filter(docTooBig);
          const oversizedCustomers = (customers || []).filter(docTooBig);

          for (const r of oversizedRooms) {
              setSyncRetryMsg(`Onarılıyor: ${r.name || 'Oda'} — görseller küçültülüyor...`);
              const { fixed, changed, droppedVideo } = await shrinkRecordMedia(r);
              if (!changed) continue;
              const { id, ...payload } = fixed;
              try {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(r.id)), payload, { merge: true });
                  setRooms(prev => prev.map(x => String(x.id) === String(r.id) ? { ...x, ...payload } : x));
                  totalRepaired++; totalDroppedVideo += droppedVideo;
              } catch (e) { console.error('Oda onarım hatası:', r.id, e); }
          }
          for (const c of oversizedCustomers) {
              setSyncRetryMsg(`Onarılıyor: ${c.name || 'Müşteri'} — belgeler küçültülüyor...`);
              const { fixed, changed, droppedVideo } = await shrinkRecordMedia(c);
              if (!changed) continue;
              const { id, ...payload } = fixed;
              try {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(c.id)), payload, { merge: true });
                  setCustomers(prev => prev.map(x => String(x.id) === String(c.id) ? { ...x, ...payload } : x));
                  totalRepaired++; totalDroppedVideo += droppedVideo;
              } catch (e) { console.error('Müşteri onarım hatası:', c.id, e); }
          }

          // ─────────────────────────────────────────────────────────────────
          // 3) TAZE KİMLİK TOKEN'I AL
          // Anonim oturumun token'ı bayatlamış/iptal olmuşsa Firestore yazmaları
          // sessizce reddeder ve kuyruk sonsuza dek takılır. force=true ile
          // token yenilenir; REST isteklerinde de bu token kullanılacaktır.
          // ─────────────────────────────────────────────────────────────────
          setSyncRetryMsg('Kimlik doğrulaması yenileniyor...');
          let idToken = null;
          try {
              if (auth?.currentUser) idToken = await auth.currentUser.getIdToken(true);
          } catch (e) {
              console.warn('Token yenilenemedi, oturum baştan açılıyor:', e);
              try { const cred = await signInAnonymously(auth); idToken = await cred.user.getIdToken(true); } catch (e2) { console.error('Oturum açılamadı:', e2); }
          }
          if (!idToken) throw new Error('AUTH_FAILED');

          // ─────────────────────────────────────────────────────────────────
          // 4) BEKLEYEN KAYITLARI REST İLE DOĞRUDAN GÖNDER (KUYRUK BAYPAS)
          // Önbellekten "sunucu onayı almamış" dokümanlar toplanır ve her biri
          // tek tek REST üzerinden yazılır. Bu yol SDK kuyruğunu kullanmadığı
          // için kuyruk kilitli olsa bile kayıtlar sunucuya ULAŞIR.
          // ─────────────────────────────────────────────────────────────────
          setSyncRetryMsg('Sunucuya ulaşmayan kayıtlar tespit ediliyor...');
          const pending = await collectPendingDocs();

          if (pending.length === 0) {
              // Bekleyen kayıt yok → ekrandaki her şey sunucuda; uyarı yanlış alarmdı.
              setSyncBlocked(false);
              setSyncRetryMsg('✓ Bekleyen kayıt bulunmadı — tüm kayıtlar sunucuda mevcut.');
              setTimeout(() => setSyncRetryMsg(''), 6000);
              return;
          }

          let sent = 0;
          const failures = [];
          for (let i = 0; i < pending.length; i++) {
              const item = pending[i];
              setSyncRetryMsg(`Yükleniyor ${i + 1}/${pending.length}: ${item.data?.name || item.data?.customerName || item.colName}...`);

              let payload = item.data;
              // Boyut ön kontrolü: 1 MiB sınırını aşan doküman sunucu tarafından REDDEDİLİR.
              // Bu yüzden önce medya küçültülür (gerekirse büyük video çıkarılır).
              if (JSON.stringify(payload).length > 950 * 1024) {
                  const { fixed, changed, droppedVideo } = await shrinkRecordMedia(payload);
                  if (changed) { payload = fixed; totalRepaired++; totalDroppedVideo += droppedVideo; }
              }

              let result = await restPatchDoc(item.colName, item.id, payload, idToken);
              // Token süresi dolduysa bir kez tazeleyip tekrar dene
              if (!result.ok && (result.code === 401 || result.code === 403)) {
                  try {
                      idToken = await auth.currentUser.getIdToken(true);
                      result = await restPatchDoc(item.colName, item.id, payload, idToken);
                  } catch (e) { /* aşağıda hata olarak raporlanır */ }
              }

              if (result.ok) {
                  sent++;
              } else {
                  failures.push({ item, message: result.message, code: result.code });
                  console.error(`REST yükleme hatası (${item.colName}/${item.id}):`, result.code, result.message);
              }
          }

          // ─────────────────────────────────────────────────────────────────
          // 5) SUNUCUDA GERÇEKTEN VAR MI? (rastgele doğrulama)
          // ─────────────────────────────────────────────────────────────────
          if (sent > 0) {
              setSyncRetryMsg('Kayıtların sunucuda oluştuğu doğrulanıyor...');
              const check = pending.find(p => !failures.some(f => f.item === p));
              if (check) await restDocExists(check.colName, check.id, idToken);
          }

          // ─────────────────────────────────────────────────────────────────
          // 6) DÜZELTİLDİ (KUSUR 2 — ALARMIN GERİ DÖNMESİ)
          // Kayıtlar REST ile sunucuya yazıldı; ANCAK SDK'nın yerel kuyruğunda
          // takılı kalan ESKİ (zehirli) yazma isteği hâlâ duruyor. Eskiden bu
          // kuyruk temizlenmediği için bekçi 30 sn sonra yine "ulaşmıyor" diyor
          // ve kırmızı şerit geri geliyordu — kullanıcı sonsuz hata görüyordu.
          // ÇÖZÜM: Veri sunucuda olduğu KESİNLEŞTİĞİNDE yerel kuyruk ve önbellek
          // güvenle silinir (terminate + clearIndexedDbPersistence) ve sayfa
          // yenilenir. Yenilenince veriler sunucudan temiz şekilde iner.
          // NOT: Bu adım YALNIZCA hiç hata olmadığında çalışır — hata varsa
          // kuyruk KORUNUR, hiçbir kayıt silinmez.
          // ─────────────────────────────────────────────────────────────────
          if (failures.length === 0) {
              setSyncBlocked(false);
              setSyncPendingCount(0);
              setSyncRetryMsg(
                  `✓ ${sent} kayıt sunucuya yüklendi — diğer kullanıcılar artık görebilir.` +
                  (totalRepaired > 0 ? ` (${totalRepaired} kayıttaki görseller küçültüldü)` : '') +
                  (totalDroppedVideo > 0 ? ` ${totalDroppedVideo} adet çok büyük video eklenemedi, fotoğraf olarak tekrar yükleyin.` : '') +
                  ' Sayfa birkaç saniye içinde yenilenecek...'
              );
              // Takılı kuyruğu kalıcı olarak temizle ve temiz başlat
              setTimeout(async () => {
                  try {
                      await terminate(db);
                      await clearIndexedDbPersistence(db);
                  } catch (e) {
                      console.warn('Yerel kuyruk temizlenemedi, yine de yenileniyor:', e);
                  } finally {
                      window.location.reload();
                  }
              }, 4000);
              return;
          }

          // Hata varsa: kuyruğa DOKUNULMAZ. Sadece bağlantı yenilemesi denenir.
          setSyncRetryMsg('Bağlantı yenileniyor...');
          try {
              await disableNetwork(db);
              await new Promise(r => setTimeout(r, 800));
              await enableNetwork(db);
          } catch (e) { console.warn('Bağlantı yenilenemedi:', e); }

          // 7) SONUÇ — GERÇEK hata mesajı gösterilir; sebep tahmin edilmez, GÖRÜLÜR.
          {
              setSyncBlocked(true);
              const f = failures[0];
              let reason = f.message;
              if (f.code === 403 || /permission/i.test(f.message)) reason = 'Sunucu yazma izni vermiyor (Firestore güvenlik kuralları).';
              else if (f.code === 401) reason = 'Kimlik doğrulama reddedildi (oturum geçersiz).';
              else if (/maximum|size|exceeds|too large/i.test(f.message)) reason = 'Kayıt çok büyük (fotoğraf/video sınırı aşıldı).';
              else if (f.code === 400) reason = `Sunucu kaydı kabul etmedi: ${f.message}`;
              else if (f.code === 0) reason = 'İnternet bağlantısı sunucuya ulaşamıyor.';
              setSyncRetryMsg(`${sent} kayıt yüklendi, ${failures.length} kayıt yüklenemedi. Sebep: ${reason}`);
          }
      } catch (e) {
          console.error('Tekrar yükleme başarısız:', e);
          setSyncBlocked(true);
          setSyncRetryMsg(
              e?.message === 'AUTH_FAILED'
                ? '✗ Sunucu kimlik doğrulaması yapılamadı. İnterneti kontrol edip tekrar deneyin. Kayıtlar KAYBOLMADI.'
                : '✗ Gönderilemedi. Mobil veriye geçip (veya Wi-Fi değiştirip) tekrar deneyin. Kayıtlar KAYBOLMADI, cihazda bekliyor.'
          );
      } finally {
          setSyncRetrying(false);
      }
  };

  // 1. Firebase Kimlik Doğrulama
  useEffect(() => {

      if (!auth) return;
      // ═══════════════════════════════════════════════════════════════════
      // GÜNCELLENDİ: SESSİZ KAYIT KAYBI DÜZELTMESİ (ENGEL KALDIRILDI)
      // SORUN: Tüm kayıt işlemleri "if (db && firebaseUser)" kapısından geçer.
      // Bir cihazda anonim oturum açma BAŞARISIZ olur ya da sonradan DÜŞERSE
      // (zayıf mobil bağlantı, açılış anındaki ağ hatası vb.) firebaseUser null
      // kalır ve o kullanıcının yaptığı TÜM girişler (oda kiralama, randevu,
      // müşteri, tahsilat...) Firebase'e HİÇ yazılmadan sessizce düşer —
      // kullanıcı kendi ekranında kaydı görür ama başka kimse göremez.
      // ÇÖZÜM (tek noktadan, tüm kayıt kapılarını birden açar):
      //   1) Oturum açma 3 kez, artan beklemeyle denenir (açılış anı ağ hatası).
      //   2) Oturum sonradan DÜŞERSE mevcut kullanıcı KORUNUR (null'a çekilmez;
      //      dinleyiciler kopmaz, yazmalar engellenmez — Firestore SDK yazmaları
      //      kuyruklayıp bağlantı gelince kendisi eşitler) ve arka planda
      //      otomatik yeniden oturum açma denenir.
      // ═══════════════════════════════════════════════════════════════════
      const initAuth = async () => {
          for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                  if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                      await signInWithCustomToken(auth, __initial_auth_token);
                  } else {
                      await signInAnonymously(auth);
                  }
                  return; // başarılı
              } catch (error) {
                  console.error(`Firebase Auth Hatası (deneme ${attempt}/3):`, error);
                  if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
              }
          }
          console.error('Firebase oturum açılamadı — kayıtlar sunucuya YAZILAMAZ. İnternet bağlantısını kontrol edip sayfayı yenileyin.');
      };
      initAuth();
      // OKUMA OPTİMİZASYONU #2: uid AYNI kaldığı sürece firebaseUser state'i güncellenmez.
      // Aksi halde auth olayları ana veri useEffect'ini yeniden tetikler, TÜM onSnapshot
      // dinleyicileri kopup yeniden bağlanır ve her koleksiyon BAŞTAN okunurdu.
      const unsubscribe = onAuthStateChanged(auth, (u) => {
          if (!u) {
              // Oturum düştü: arka planda sessizce yeniden bağlan (kullanıcı korunur)
              signInAnonymously(auth).catch((e) => console.error('Yeniden oturum açma hatası:', e));
          }
          // u null ise MEVCUT kullanıcı korunur → yazma kapıları KAPANMAZ,
          // dinleyiciler kopmaz; tüm kullanıcıların girişleri herkeste görünmeye devam eder.
          setFirebaseUser(prev => u ? ((prev && prev.uid === u.uid) ? prev : u) : prev);
      });
      return () => unsubscribe();
  }, []);

// 2. Firebase Canlı Veri Dinleme (Tüm Modüller Dahil)
  useEffect(() => {
      if (!firebaseUser || !db) return;
      
      const unsubCustomers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'customers'), (snapshot) => { const fetchedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (fetchedData.length > 0) setCustomers(fetchedData); setAppDataReady(true); }, (error) => { console.error("Hata:", error); setAppDataReady(true); });
      // OKUMA LİMİTİ: Depo sayısı doğası gereği azdır; canlı dinleme 200 kayıtla sınırlandırıldı.
      const unsubWarehouses = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'warehouses'), limit(200)), (snapshot) => { const fetchedData = snapshot.docs.map(doc => ({ id: Number(doc.id) || doc.id, ...doc.data() })).sort((a,b) => (a.orderIndex ?? a.id) - (b.orderIndex ?? b.id)); setWarehouses(fetchedData); }, (error) => console.error("Hata:", error));
      // OKUMA LİMİTİ: Blok sayısı azdır (depo × blok); canlı dinleme 200 kayıtla sınırlandırıldı.
      const unsubBlocks = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'blocks'), limit(200)), (snapshot) => { const fetchedData = snapshot.docs.map(doc => ({ id: Number(doc.id) || doc.id, ...doc.data() })).sort((a,b) => (a.orderIndex ?? a.id) - (b.orderIndex ?? b.id)); setBlocks(fetchedData); }, (error) => console.error("Hata:", error));
      const unsubRooms = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'rooms'), (snapshot) => { const fetchedData = snapshot.docs.map(doc => ({ id: Number(doc.id) || doc.id, ...doc.data() })).sort((a,b) => (a.orderIndex ?? a.id) - (b.orderIndex ?? b.id)); setRooms(fetchedData); }, (error) => console.error("Hata:", error));
      const unsubPendingCollections = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'pendingCollections'), (snapshot) => { const fetchedData = snapshot.docs.map(doc => ({ id: Number(doc.id) || doc.id, ...doc.data() })); setPendingCollections(fetchedData); }, (error) => console.error("Hata:", error));
      // OKUMA LİMİTİ: Panel kullanıcı sayısı azdır; canlı dinleme 200 kayıtla sınırlandırıldı.
      const unsubSystemUsers = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'systemUsers'), limit(200)), (snapshot) => { const fetchedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (fetchedData.length > 0) { setSystemUsers(fetchedData); } else { setSystemUsers([{ id: '1', username: 'admin', password: 'admin', name: 'Sistem Yöneticisi', role: 'Yönetici' }]); } }, (error) => console.error("Hata:", error));
      // OKUMA OPTİMİZASYONU #3: Randevular artık SINIRSIZ çekilmez. where('date','>=') ile
      // yalnızca son 90 gün + tüm GELECEK randevular canlı dinlenir. Daha eski aylar,
      // takvimde o aya gidildiğinde tek seferlik yüklenir (aşağıdaki "Daha Eski Kayıt" effect'i).
      const APPT_CUTOFF = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split('T')[0]; })();
      // OKUMA LİMİTİ: Tarih penceresine EK OLARAK 200 kayıt sınırı. orderBy('date') ile pencerenin
      // EN YENİ değil EN ESKİ ucundan başlanır; 200'ü aşan çok eski kayıtlar zaten aşağıdaki
      // tek seferlik "daha eski yükle" akışıyla getDocs ile çekilir.
      // ═══════════════════════════════════════════════════════════════════════
      // DÜZELTİLDİ (RANDEVU GÖRÜNMEME SORUNU):
      // ESKİ HATA: orderBy('date') ARTAN sıra + limit(200) → pencere EN ESKİ uçtan (90 gün önce)
      // başlıyordu. Son 90 günde 200'den fazla randevu olunca BUGÜN ve GELECEK randevular
      // listeye hiç girmiyordu; yeni kaydedilen randevu Firebase'e yazılsa da ekranda görünmüyordu.
      // YENİ: orderBy('date','desc') AZALAN sıra → pencere EN YENİ uçtan (gelecek/bugün) başlar,
      // yeni eklenen randevu her zaman pencerenin içindedir. Limit de 500'e çıkarıldı
      // (onSnapshot ilk yüklemeden sonra yalnızca değişen belgeleri okur; maliyet artmaz).
      // ═══════════════════════════════════════════════════════════════════════
      const APPT_LIVE_LIMIT = 500;
      const unsubAppointments = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'appointments'), where('date', '>=', APPT_CUTOFF), orderBy('date', 'desc'), limit(APPT_LIVE_LIMIT)), (snapshot) => {
          const fetchedData = snapshot.docs.map(doc => ({ id: Number(doc.id) || doc.id, ...doc.data() }));
          // Limit dolduysa pencerenin GERÇEK alt sınırı, gelen en eski kayıttır; dolmadıysa cutoff'tur.
          // Bu sınırın ALTINDAKİ (daha eski) kayıtlar state'te korunur, pencere içi tazelenir.
          const windowStart = fetchedData.length >= APPT_LIVE_LIMIT
              ? fetchedData.reduce((min, a) => (String(a.date || '') < min ? String(a.date || '') : min), '9999-12-31')
              : APPT_CUTOFF;
          setAppointments(prev => {
              const older = (prev || []).filter(a => a && String(a.date || '') < windowStart);
              const m = new Map(); [...older, ...fetchedData].forEach(a => m.set(String(a.id), a));
              return Array.from(m.values());
          });
      }, (error) => console.error("Hata:", error));
      // YENİ: Hatırlatmalar dinleyicisi (küçük operasyonel koleksiyon — bildirim ışığı için app genelinde gerekli)
      // OKUMA OPTİMİZASYONU #4: Hatırlatmalar SINIRSIZ dinlenmez. İki dar canlı sorgu:
      //   (a) completed == false → TÜM açık hatırlatmalar (bildirim rozeti ve masaüstü uyarıları için şart)
      //   (b) date >= son 60 gün → yakın geçmiş + gelecek (tamamlanmışlar dahil, takvim görünümü için)
      // Her sorgu kendi kapsamındaki kayıtları TAZELER (silinen/tamamlanan güncel kalır),
      // kapsam dışı (eski tamamlanmış) kayıtlar state'te korunur.
      const REM_CUTOFF = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0]; })();
      const applyReminderSnap = (snapshot, inScope) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setReminders(prev => {
              const kept = (prev || []).filter(r => r && !inScope(r));
              const m = new Map(); [...kept, ...data].forEach(r => m.set(String(r.id), r));
              return Array.from(m.values());
          });
      };
      // OKUMA LİMİTİ: Açık (tamamlanmamış) hatırlatmalar 200 kayıtla sınırlandırıldı.
      // NOT: Burada orderBy KULLANILMAZ — where('completed') + orderBy('date') bileşik indeks
      // gerektirir ve indeks yoksa sorgu hata verip bildirim rozeti çalışmaz.
      const unsubRemindersOpen = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'reminders'), where('completed', '==', false), limit(200)), (snapshot) => applyReminderSnap(snapshot, (r) => r.completed === false), (error) => console.error("Hatırlatma Çekme Hatası:", error));
      // OKUMA LİMİTİ: Yakın tarihli hatırlatmalar 200 kayıtla sınırlandırıldı (tek alan → indeks gerekmez).
      const unsubRemindersRecent = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'reminders'), where('date', '>=', REM_CUTOFF), orderBy('date'), limit(200)), (snapshot) => applyReminderSnap(snapshot, (r) => String(r.date || '') >= REM_CUTOFF), (error) => console.error("Hatırlatma Çekme Hatası:", error));
      // YENİ EKLENEN: ROL İZİNLERİ FİREBASE DİNLEYİCİSİ (kaydedilen yetkiler geri yüklenir)
      // OKUMA LİMİTİ: Rol sayısı çok azdır; canlı dinleme 100 kayıtla sınırlandırıldı.
      const unsubUserRoles = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'userRoles'), limit(100)), (snapshot) => { const fetchedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (fetchedData.length > 0) setUserRoles(fetchedData); }, (error) => console.error("Rol Çekme Hatası:", error));
      // PERFORMANS/LİMİT: activityLogs, deletedItems ve userSessions artık SÜREKLİ DİNLENMEZ (onSnapshot kaldırıldı).
      // Bu büyük log/geçmiş koleksiyonları, ilgili sayfaya girildiğinde veya "Yenile" ile TEK SEFERLİK
      // getDocs + limit(100) ile çekilir (bkz. fetchActivityLogs / fetchDeletedItems / fetchUserSessions).
      
// 👇 SİSTEM AYARLARINI (SÖZLEŞME VE ORANLAR) FİREBASE'DEN ÇEKME 👇
      // OKUMA OPTİMİZASYONU #5: settings KOLEKSİYONUNUN TAMAMI dinlenmiyordu ama içinde
      // 'bankTransactions' gibi BÜYÜK ve SIK YAZILAN dokümanlar da vardı — her banka kaydında
      // o koca doküman tüm açık istemcilere yeniden okutuluyordu. Artık yalnızca gerçekten
      // kullanılan 2 küçük doküman ('contract' ve 'rates') doküman-bazlı dinlenir.
      const unsubContract = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'contract'), (snap) => { if (snap.exists()) setContractSettings(snap.data()); }, (error) => console.error("Ayar Çekme Hatası:", error));
      const unsubRates = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'rates'), (snap) => { if (snap.exists()) setCollectionRates(snap.data()); }, (error) => console.error("Ayar Çekme Hatası:", error));

      // PERFORMANS/LİMİT: bulkUploadHistory da sürekli dinlenmez; Ödeme Girişi sayfasına girince
      // tek seferlik getDocs + limit ile çekilir (bkz. fetchBulkUploadHistory).

      // YENİ: ŞUBE KONTROL KAYITLARI DİNLEYİCİSİ (Temizlik / İlaçlama / Genel Kontrol)
      // OKUMA LİMİTİ: Son 300 kayıt canlı dinlenir (şube başına yılda ~50 kayıt beklenir).
      const unsubInspections = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'inspections'), limit(300)), (snapshot) => {
          const fetchedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setInspections(fetchedData);
      }, (error) => console.error("Kontrol Kaydı Çekme Hatası:", error));

      // CLEANUP: Menü/oturum değişiminde TÜM canlı dinleyiciler kapatılır — açık kalan
      // dinleyici hem bellek sızdırır hem her değişiklikte gereksiz okuma üretir.
      return () => { 
          unsubCustomers(); unsubWarehouses(); unsubBlocks(); unsubRooms(); unsubPendingCollections(); unsubSystemUsers(); unsubAppointments();
          unsubRemindersOpen(); unsubRemindersRecent();
          unsubContract(); unsubRates(); unsubUserRoles(); unsubInspections();
      };
  }, [firebaseUser]);

  // PERFORMANS: Büyük log/geçmiş koleksiyonlarını SÜREKLİ dinlemek yerine TEK SEFERLİK çeken fonksiyonlar.
  // Her biri en fazla ~100 (toplu yükleme için 50) kayıt getirir; ilgili sayfaya girince veya "Yenile" ile çağrılır.
  const fetchActivityLogs = async () => {
      if (!db) return;
      try {
          const snap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'activityLogs'), orderBy('dateISO', 'desc'), limit(100)));
          setActivityLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("İşlem kayıtları çekme hatası:", e); }
  };
  const fetchDeletedItems = async () => {
      if (!db) return;
      try {
          const snap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'deletedItems'), orderBy('deletedAtISO', 'desc'), limit(100)));
          setDeletedItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("Silinen kayıtları çekme hatası:", e); }
  };
  const fetchUserSessions = async () => {
      if (!db) return;
      try {
          const snap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'userSessions'), orderBy('loginISO', 'desc'), limit(100)));
          setUserSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("Oturumları çekme hatası:", e); }
  };

  // İlgili sayfaya GİRİLDİĞİNDE ilgili koleksiyonu bir kez çeker (sürekli dinleme yerine).
  useEffect(() => {
      if (!db || !firebaseUser) return;
      if (activeMenu === 'islem-hareketleri') fetchActivityLogs();
      else if (activeMenu === 'islem-geri-yukle') fetchDeletedItems();
      else if (activeMenu === 'kullanici-hareketleri') fetchUserSessions();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, firebaseUser]);

  // --- YENİ: AUTH VE KULLANICI STATE'LERİ ---
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [rememberMe, setRememberMe] = useState(false); // YENİ EKLENDİ
  const [isAuthenticated, setIsAuthenticated] = useState(false); // EKLENDİ: eksikti, beyaz ekran hatasına sebep oluyordu

  // YENİ EKLENDİ: Sayfa yüklendiğinde beni hatırla verisi varsa otomatik giriş yap
  useEffect(() => {
      const savedUser = persistStore.get('depoevim_saved_user');
      if (savedUser) {
          try {
              const userObj = JSON.parse(savedUser);
              setCurrentUserProfile({...userObj, oldPassword: '', newPassword: '', confirmPassword: ''});
              // Giriş formunu da otomatik doldur
              if (userObj.username) setLoginData({ username: userObj.username, password: userObj.password || '' });
              setRememberMe(true);
              setIsAuthenticated(true);
          } catch (e) {
              persistStore.remove('depoevim_saved_user');
          }
      }
  }, []);
  
  const [systemUsers, setSystemUsers] = useState([{ id: '1', username: 'admin', password: 'admin', name: 'Sistem Yöneticisi', role: 'Yönetici' }]);
  const [userToDeleteId, setUserToDeleteId] = useState(null); // YENİ: panel kullanıcısı silme onay penceresi
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({ username: '', password: '', name: '', role: 'Personel', email: '', phone: '' });

  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editUserData, setEditUserData] = useState(null);

  // --- KULLANICI ROLLERİ STATE'LERİ ---
  const availablePermissions = {
      mainMenus: [
          { id: 'menu-dashboard', label: 'Anasayfa' },
          { id: 'menu-takvim', label: 'Randevular' },
          { id: 'menu-hatirlatmalar', label: 'Hatırlatmalar' },
          { id: 'menu-musteri-listesi', label: 'Müşteri Listesi' },
          { id: 'menu-odeme-islemleri', label: 'Ödeme İşlemleri' },
          { id: 'menu-depo', label: 'Depo Listesi' },
          { id: 'menu-finans-yonetimi', label: 'Finans Yönetimi' },
          { id: 'menu-sistem-hesaplari', label: 'Sistem Hesapları' },
          { id: 'menu-sistem-ayarlari', label: 'Sistem Ayarları' }
      ],
      pages: [
          { id: 'page-musteri-ekle', label: 'Yeni Müşteri Ekle' },
          { id: 'page-mevcut-musteriler', label: 'Mevcut Müşteriler' },
          { id: 'page-tum-musteriler', label: 'Tüm Müşteriler' },
          { id: 'page-odeme-girisi', label: 'Tahsilat Girişi Yap' },
          { id: 'page-askida-kalan-odemeler', label: 'Askıda Kalan Tahsilatlar' },
          { id: 'page-tahsilat-hareketleri', label: 'Tahsilat Hareketleri' },
          { id: 'page-gunu-gelen-odalar', label: 'Günü Gelen Odalar' },
          { id: 'page-senesi-dolan-odalar', label: 'Senesi Dolan Odalar' },
          { id: 'page-aylik-odeme', label: 'Aylık Borç Takip' },
          { id: 'page-hatirlatmalar', label: 'Hatırlatmalar' },
          { id: 'page-kdvsiz-cariler', label: 'KDVsiz Cariler' },
          { id: 'page-icra-odalari', label: 'İcra Odaları' },
          // YENİ: Hediye Verilen Odalar sayfası yetkisi
          { id: 'page-hediye-verilen-odalar', label: 'Hediye Verilen Odalar' },
          { id: 'page-finans-rapor', label: 'Finans Rapor' },
          { id: 'page-depo-rapor', label: 'Depo Rapor' },
          { id: 'page-personel-rapor', label: 'Personel Rapor' },
          { id: 'page-panel-kullanicilari', label: 'Panel Kullanıcıları' },
          { id: 'page-kullanici-rolleri', label: 'Kullanıcı Rolleri' },
          { id: 'page-kullanici-hareketleri', label: 'Kullanıcı Hareketleri (Giriş/Çıkış)' },
          { id: 'page-pdf-sozlesme', label: 'PDF & Sözleşme Ayarları' },
          { id: 'page-tahsilat-oranlari', label: 'Tahsilat Oranları' },
          { id: 'page-islem-hareketleri', label: 'İşlem Hareketleri (Aktivite Kaydı)' },
          { id: 'page-islem-geri-yukle', label: 'İşlem Geri Yükle (Silinen Kayıtlar)' }
      ],
      actions: [
          { id: 'action-yeni-musteri', label: 'Yeni Müşteri Ekleme' },
          { id: 'action-yeni-oda', label: 'Oda Ekleme' },
          { id: 'action-oda-duzenle', label: 'Oda Düzenleme' },
          { id: 'action-musteri-duzenle', label: 'Müşteri Düzenleme' },
          { id: 'action-hediye-ay', label: 'Hediye Ay Etme' },
          { id: 'action-ucretsiz-oda', label: 'Ücretsiz Oda Etme' },
          { id: 'action-cari-duzenle', label: 'Cari İşlemleri Düzenleme' },
          { id: 'action-cari-sil', label: 'Cari Silme' },
          { id: 'action-musteri-sil', label: 'Müşteri Silme (Kalıcı Sil)' },
          { id: 'action-yeni-randevu', label: 'Yeni Randevu Ekleme' },
          { id: 'action-sube-sil', label: 'Depo Listesinden Şube Silme' },
          { id: 'action-blok-sil', label: 'Depo Listesinden Blok Silme' },
          { id: 'action-oda-sil', label: 'Depo Listesinden Oda Silme' },
          { id: 'action-oda-degistir', label: 'Oda Değiştirme' },
          { id: 'action-giris-cikis', label: 'Oda Giriş Çıkış İşlemi' },
          { id: 'action-depodan-cikis', label: 'Odadan Çıkış Yapma' },
          { id: 'action-tahsilat-girisi', label: 'Tahsilat Girişi Yapma' },
          { id: 'action-depo-duzenle', label: 'Depo İsmini Değiştirme' },
          { id: 'action-blok-duzenle', label: 'Blok İsmini Değiştirme' },
          { id: 'action-depo-ekle', label: 'Depo Ekleme' },
          { id: 'action-blok-ekle', label: 'Blok Ekleme' },
          { id: 'action-gecmis-zam-duzenle', label: 'Geçmiş Zamları Düzenleme' },
          { id: 'action-kira-dokum-duzenle', label: 'Aylık Kiralama Dökümü Kira Düzenleme' },
          { id: 'action-giris-bilgi-duzenle', label: 'Giriş Bilgileri Düzenleme' },
          { id: 'action-oda-icra', label: 'Oda İcra' },
          { id: 'action-musteri-bilgilendirme', label: 'Müşteri Bilgilendirme' },
          { id: 'action-faiz-pasif', label: 'Faizi Pasife Alma' },
          { id: 'action-cari-odeme-ekle', label: 'Cariye Ödeme (Borç) Ekleme' },
          { id: 'action-cari-odeme-yap', label: 'Cariye Ödeme Yapma' },
          { id: 'action-arsiv-sil', label: 'Arşiv / Ek Belge Silme' },
          { id: 'action-askida-sil', label: 'Askıda Tahsilat Silme' },
          { id: 'action-askida-duzenle', label: 'Askıda Tahsilat Düzenleme' },
          { id: 'action-tahsilat-sil', label: 'Tahsilat Hareketi Silme' },
          { id: 'action-tahsilat-duzenle', label: 'Tahsilat Hareketi Düzenleme' },
          { id: 'action-zam-yap', label: 'Senesi Dolan Odalar Zam Yapma' }
      ]
  };

  const [userRoles, setUserRoles] = useState([
      { id: 'yonetici', name: 'Yönetici', code: 'yonetici', isSuper: true, permissions: { mainMenus: [], pages: [], actions: [] } },
      { id: 'personel', name: 'Personel', code: 'personel', isSuper: false, permissions: { mainMenus: ['menu-dashboard', 'menu-depo', 'menu-musteri-listesi'], pages: ['page-aylik-odeme', 'page-mevcut-musteriler'], actions: [] } },
      { id: 'muhasebe', name: 'Muhasebe', code: 'muhasebe', isSuper: false, permissions: { mainMenus: ['menu-odeme-islemleri', 'menu-finans-yonetimi'], pages: ['page-aylik-odeme', 'page-tahsilat-hareketleri'], actions: [] } },
      // YENİ: AVUKAT — yalnızca İcra Odaları sayfasını ve icradaki müşterilerin carilerini GÖRÜNTÜLER; hiçbir değişiklik yapamaz.
      { id: 'avukat', name: 'Avukat', code: 'avukat', isSuper: false, permissions: { mainMenus: ['menu-odeme-islemleri', 'menu-musteri-listesi'], pages: ['page-icra-odalari'], actions: [] } }
  ]);

  const [newRoleInput, setNewRoleInput] = useState({ name: '', code: '', copyFrom: '' });

  const handleAddRole = () => {
      if (!newRoleInput.name) return;
      // Kodları otomatik temizle (Türkçe karakterleri ve boşlukları at)
      const code = newRoleInput.name.toLowerCase().replace(/[^a-z0-9]/gi, '').replace(/\s+/g, '_');
      
      const newRole = {
          id: 'role_' + Date.now(),
          name: newRoleInput.name,
          code: code,
          isSuper: false,
          permissions: { mainMenus: [], pages: [], actions: [] }
      };
      setUserRoles([...userRoles, newRole]);
      setNewRoleInput({ name: '', code: '', copyFrom: '' });
  };

  const handleDeleteRole = (roleId) => {
      if (!window.confirm('Bu rolü silmek istediğinize emin misiniz?')) return;
      const role = userRoles.find(r => r.id === roleId);
      if(role?.isSuper) return alert("Süper yönetici rolü silinemez.");
      
      // Eğer bu rolde kullanıcı varsa silmeyi engelle
      if(systemUsers.some(u => u.role === role.name)) {
          return alert("Bu role atanmış aktif kullanıcılar var. Rolü silmeden önce kullanıcı listesinden bu kişilerin rolünü değiştirmelisiniz.");
      }
      setUserRoles(userRoles.filter(r => r.id !== roleId));
  };

  const handleTogglePermission = (roleId, type, permId) => {
      const role = userRoles.find(r => r.id === roleId);
      if (!role) return;
      const currentPerms = role.permissions[type] || [];
      const has = currentPerms.includes(permId);
      const newPermsList = has ? currentPerms.filter(p => p !== permId) : [...currentPerms, permId];
      const updatedRole = { ...role, permissions: { ...role.permissions, [type]: newPermsList } };
      // Yerel state'i güncelle
      setUserRoles(prev => prev.map(r => r.id === roleId ? updatedRole : r));
      // YENİ / DÜZELTME: Değişiklik ANINDA Firebase'e de yazılır. Böylece "İzinleri kaydet" unutulsa veya
      // userRoles dinleyicisi araya girse bile verilen yetki (örn. "Oda Giriş Çıkış İşlemi") kaybolmaz ve
      // personelde anında etkinleşir. (Önizlemede db null olduğundan yalnızca yerel state güncellenir.)
      if (db && firebaseUser) {
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'userRoles', String(updatedRole.id)), updatedRole, { merge: true }).catch(e => console.error('Rol İzni Otomatik Kaydetme Hatası:', e));
      }
  };

  // YENİ EKLENEN: Rol izinlerini Firebase'e (ve state'e) kalıcı olarak kaydet
  const handleSaveRolePermissions = async (roleId) => {
      const role = userRoles.find(r => r.id === roleId);
      if (!role) return;
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'userRoles', String(role.id)), role, { merge: true });
          } catch (e) { console.error('Rol İzni Kaydetme Hatası:', e); alert('Kaydetme sırasında hata oluştu.'); return; }
      }
      // Bu role sahip giriş yapmış kullanıcı varsa, aktif izinleri anında yenile
      alert(`"${role.name}" rolünün izinleri kaydedildi.`);
  };

  // YENİ EKLENEN: Giriş yapan kullanıcının rolü + izin kontrol yardımcıları
  const getCurrentRole = () => userRoles.find(r => r.name === currentUserProfile.role || r.code === currentUserProfile.role);
  const currentRoleIsSuper = () => { const r = getCurrentRole(); return !r || r.isSuper; }; // rol bulunamazsa güvenli taraf: süper say (mevcut davranış korunur)
  // type: 'mainMenus' | 'pages' | 'actions'
  const hasPerm = (type, permId) => {
      const r = getCurrentRole();
      if (!r) return true;          // rol tanımı yoksa engelleme (geriye dönük uyumluluk)
      if (r.isSuper) return true;   // süper yönetici her şeyi görür
      return (r.permissions?.[type] || []).includes(permId);
  };

  // YENİ: AVUKAT rolü tespiti — rol adında/kodunda "avukat" geçen kullanıcılar SADECE GÖRÜNTÜLEME yapar.
  const isAvukat = () => {
      const r = getCurrentRole();
      if (!r || r.isSuper) return false;
      const s = String((r.name || '') + ' ' + (r.code || '')).toLocaleLowerCase('tr');
      return s.includes('avukat');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // YENİ EKLENEN: AVUKAT ROLÜ — İCRA MÜŞTERİSİNİN CARİSİNİ GÖREBİLME İSTİSNASI
  // Avukat rolünde "Müşteri Listesi" sayfa yetkisi YOKTUR; bu yüzden İcra Odaları
  // ekranındaki "Carisine Git" butonuna bastığında "Erişim İzniniz Yok" alıyordu.
  // Bu yardımcı, bir müşterinin İCRA (yasal takip) sürecinde odası olup olmadığını
  // döndürür; aşağıdaki sayfa izni kontrolü bu sayede SADECE icra müşterileri için
  // avukata cari görüntüleme izni verir. Diğer müşteriler kapalı kalır.
  // ═══════════════════════════════════════════════════════════════════════════
  const isLegalActionCustomer = (customerId) => {
      if (!customerId) return false;
      const c = customers.find(x => String(x.id) === String(customerId));
      if (!c) return false;
      return rooms.some(r => r.customerName === c.name && r.isUnderLegalAction);
  };

  // YENİ EKLENEN: İşlem (buton) izni kontrolü — izin yoksa kullanıcıyı uyarır.
  // Butonlar herkes tarafından GÖRÜNÜR; ama izni olmayan tıklayınca işlem yapılmaz.
  const checkActionPerm = (permId) => {
      // YENİ: Avukat rolü hiçbir kayıt/değişiklik işlemi yapamaz — yalnızca görüntüler.
      if (isAvukat()) { alert('⚖️ Avukat rolü yalnızca GÖRÜNTÜLEME yapabilir.\n\nİcra dosyalarının carilerini inceleyebilirsiniz; değişiklik yetkiniz yoktur.'); return false; }
      if (hasPerm('actions', permId)) return true;
      alert('⚠️ Yetkiniz bulunmamaktadır.\n\nBu işlemi yapabilmek için lütfen yöneticiniz ile iletişime geçin.');
      return false;
  };

  // YENİ EKLENEN: Kullanıcı işlem hareketi (aktivite) kaydı oluştur
  const logActivity = async (type, description) => {
      try {
          const entry = {
              id: `${Date.now()}_${Math.floor(Math.random()*1000)}`,
              userName: currentUserProfile?.name || 'Bilinmeyen',
              userRole: getCurrentRole()?.name || currentUserProfile?.role || '',
              type: type || 'İşlem',
              description: description || '',
              dateISO: new Date().toISOString()
          };
          if (db && firebaseUser) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'activityLogs', String(entry.id)), entry);
          } else {
              setActivityLogs(prev => [entry, ...prev]);
          }
      } catch (e) { console.error('Log kaydı hatası:', e); }
  };

  // ŞUBE KONTROL KAYITLARI fonksiyonları (handleSaveInspection, handleAddInspectionNote,
  // handleDeleteInspection, getLastInspection) → src/depo.jsx içine taşındı.

  // YENİ: SİLİNEN KAYIT ÇÖP KUTUSU — silme anında kaydın TAM kopyasını saklar (geri yükleme için).
  // entityType: 'customer'|'room'|'warehouse'|'block'|'appointment'|'payment' vb.
  // collectionName: Firestore koleksiyon adı (geri yüklerken aynı yere yazılır)
  // data: silinen kaydın tam nesnesi
  const archiveDeletedItem = async (entityType, collectionName, data, extraLabel) => {
      try {
          if (!data) return;
          const entry = {
              id: `del_${Date.now()}_${Math.floor(Math.random()*10000)}`,
              entityType: entityType || 'kayit',
              collectionName: collectionName || '',
              label: extraLabel || data.name || data.customerName || data.title || (data.id ? `#${data.id}` : 'Kayıt'),
              data: data,                       // Geri yükleme için tam veri
              deletedBy: currentUserProfile?.name || 'Bilinmeyen',
              deletedByRole: getCurrentRole()?.name || currentUserProfile?.role || '',
              deletedAtISO: new Date().toISOString(),
              restored: false
          };
          setDeletedItems(prev => [entry, ...prev]);
          if (db && firebaseUser) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'deletedItems', String(entry.id)), entry);
          }
      } catch (e) { console.error('Çöp kutusu arşiv hatası:', e); }
  };

  // YENİ: Silinen kaydı geri yükle — orijinal koleksiyona geri yazar, çöp kutusundan kaldırır
  const handleRestoreDeletedItem = async (entry) => {
      try {
          if (!entry?.data) return;
          const setterMap = {
              'customers': setCustomers, 'rooms': setRooms, 'warehouses': setWarehouses,
              'blocks': setBlocks, 'appointments': setAppointments
          };
          const localSetter = setterMap[entry.collectionName];
          if (localSetter) {
              localSetter(prev => {
                  const exists = prev.some(x => String(x.id) === String(entry.data.id));
                  return exists ? prev : [entry.data, ...prev];
              });
          }
          if (db && firebaseUser && entry.collectionName) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', entry.collectionName, String(entry.data.id)), entry.data);
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'deletedItems', String(entry.id)));
          }
          setDeletedItems(prev => prev.filter(x => x.id !== entry.id));
          logActivity('İşlem Geri Yükleme', `${entry.entityType} geri yüklendi: ${entry.label}`);
      } catch (e) { console.error('Geri yükleme hatası:', e); }
  };

  // --- MÜŞTERİ YÖNETİMİ STATE'LERİ ---
  const [openSubMenus, setOpenSubMenus] = useState({'musteri-listesi': true});
  // YENİ EKLENEN: İşlem Hareketleri (aktivite kaydı)
  const [activityLogs, setActivityLogs] = useState([]);
  // YENİ: Silinen kayıtların çöp kutusu (geri yükleme menüsü için)
  const [deletedItems, setDeletedItems] = useState([]);
  // YENİ: İşlem Geri Yükle menüsü zaman filtresi
  const [restoreRange, setRestoreRange] = useState('all'); // today|week|month|year|all
  const [logUserFilter, setLogUserFilter] = useState('all');
  const [logTimeFilter, setLogTimeFilter] = useState('all');
  // YENİ EKLENEN: Kullanıcı Hareketleri (oturum giriş/çıkış takibi)
  const [userSessions, setUserSessions] = useState([]);
  // YENİ: Kullanıcı Hareketleri sayfası filtreleri (zaman aralığı + kullanıcı)
  const [sessionTimeFilter, setSessionTimeFilter] = useState('all'); // 'all' | 'today' | '7days' | '30days'
  const [sessionUserFilter, setSessionUserFilter] = useState('');     // '' → tümü | userName
  const [currentSessionId, setCurrentSessionId] = useState(null);
  // YENİ EKLENEN: Türkiye'nin 81 ili (İl seçim kutusu için) — İstanbul listenin başında
  const turkiyeIlleri = [
      'İstanbul','Adana','Adıyaman','Afyonkarahisar','Ağrı','Amasya','Ankara','Antalya','Artvin','Aydın','Balıkesir',
      'Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum','Denizli',
      'Diyarbakır','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari',
      'Hatay','Isparta','Mersin','İzmir','Kars','Kastamonu','Kayseri','Kırklareli','Kırşehir',
      'Kocaeli','Konya','Kütahya','Malatya','Manisa','Kahramanmaraş','Mardin','Muğla','Muş','Nevşehir',
      'Niğde','Ordu','Rize','Sakarya','Samsun','Siirt','Sinop','Sivas','Tekirdağ','Tokat',
      'Trabzon','Tunceli','Şanlıurfa','Uşak','Van','Yozgat','Zonguldak','Aksaray','Bayburt','Karaman',
      'Kırıkkale','Batman','Şırnak','Bartın','Ardahan','Iğdır','Yalova','Karabük','Kilis','Osmaniye','Düzce'
  ];

  const [customerType, setCustomerType] = useState('bireysel'); 
  
  const [newCustomer, setNewCustomer] = useState({
      name: '', tc: '', phone: '', altPhone: '', email: '', address: '', city: 'İstanbul', district: '', taxOffice: '', notes: '',
      hasProxy: false, proxyName: '', proxyTc: '', proxyPhone: '', proxyAltPhone: '', proxyAddress: '', proxyDocumentPhoto: null,
      documentPhotoFront: null, documentPhotoBack: null
  });
  const [customerSaveError, setCustomerSaveError] = useState('');

  // YENİ EKLENEN: Oda Listesi kartındaki göz ikonu ile açılan oda fotoğrafı önizleme/yükleme penceresi
  const [roomPhotoViewer, setRoomPhotoViewer] = useState(null); // oda id'si
  // YENİ EKLENEN: Oda detayından "Randevu Oluştur" modalı
  const [roomAppointmentModal, setRoomAppointmentModal] = useState(false);
  const [roomAppointmentData, setRoomAppointmentData] = useState({ date: new Date().toISOString().split('T')[0], time: '10:00 - 11:00', purpose: 'giris-cikis' });
  // entityPhotoViewer (depo/blok fotoğraf penceresi) → src/depo.jsx içine taşındı.




  // YENİ EKLENEN: KDVsiz Cariler sayfası için arama state'i
  const [kdvsizSearchTerm, setKdvsizSearchTerm] = useState('');

  // --- SENESİ DOLAN ODALAR STATE'LERİ ---
  const [anniversaryMonth, setAnniversaryMonth] = useState((new Date().getMonth() + 1).toString());
  const [anniversaryYear, setAnniversaryYear] = useState(new Date().getFullYear().toString());
  const [anniversarySearchTerm, setAnniversarySearchTerm] = useState('');

  // --- YENİ: HEDİYE VERİLEN ODALAR SAYFASI STATE'LERİ ---
  // giftPageRange: 'busene' | 'gecensene' | 'all'  → hediye ayının denk geldiği takvim yılına göre süzer
  const [giftPageRange, setGiftPageRange] = useState('busene');
  const [giftPageSearch, setGiftPageSearch] = useState('');

  // --- GÜNÜ GELEN ODALAR STATE'LERİ ---
  const [dueRoomsDate, setDueRoomsDate] = useState(new Date().toISOString().split('T')[0]);


  // --- MESAJ GÖNDERİM STATE'İ ---
  const [messageModalData, setMessageModalData] = useState(null);

  // --- RANDEVU VE TAKVİM STATE'LERİ ---
  const [appointments, setAppointments] = useState([]); // TEMİZLENDİ: Örnek/sahte randevu kayıtları kaldırıldı, liste boş başlar.
  // YENİ: Hatırlatmalar (muhasebe takvimi) — ödeme sözü / günlük not / görev. Her kayıt:
  // { id, date:'YYYY-MM-DD', time:'HH:MM'|'', title, note, type:'promise'|'note'|'task', customerName, completed, createdAt }
  const [reminders, setReminders] = useState([]);
  const [reminderModal, setReminderModal] = useState(null); // null | {mode:'add'|'edit', data:{...}}
  // YENİ EKLENEN: Hatırlatma modalındaki "Müşteri" alanı artık aranabilir — kullanıcının
  // yazdığı metin burada tutulur; dropdown açık/kapalı durumu da burada yönetilir.
  const [reminderCustomerSearch, setReminderCustomerSearch] = useState('');
  const [reminderCustomerDropdownOpen, setReminderCustomerDropdownOpen] = useState(false);
  const [reminderSelectedDate, setReminderSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointmentData, setAppointmentData] = useState({
    customerType: 'registered',
    customerId: '',
    unregisteredName: '',
    unregisteredPhone: '',
    warehouseId: '',
    date: new Date().toISOString().split('T')[0],
    time: '10:00 - 11:00',
    purpose: 'giris-cikis'
  });
const [apptCustomerSearch, setApptCustomerSearch] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // ═══════════════════════════════════════════════════════════════════════════
  // OKUMA OPTİMİZASYONU #6: "DAHA ESKİ KAYITLARI YÜKLE" (Sayfalama / Lazy-Load)
  // Canlı dinleyiciler yalnızca güncel pencereyi izler. Kullanıcı takvimde eski
  // bir aya giderse, o eski kayıtlar TEK SEFERLİK getDocs + limit ile çekilir ve
  // state'e eklenir. Böylece geçmiş yıllar sürekli dinlenmez ama erişilebilir kalır.
  // ═══════════════════════════════════════════════════════════════════════════
  const olderApptLoadedRef = useRef(false);
  useEffect(() => {
      if (!db || !firebaseUser || olderApptLoadedRef.current) return;
      const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split('T')[0]; })();
      const viewedMonthStart = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`;
      if (viewedMonthStart >= cutoff.slice(0, 7) + '-01') return; // görüntülenen ay zaten canlı penceredeyse çekme
      olderApptLoadedRef.current = true; // yalnızca 1 kez çekilir
      (async () => {
          try {
              const snap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'appointments'), where('date', '<', cutoff), orderBy('date', 'desc'), limit(300)));
              const older = snap.docs.map(d => ({ id: Number(d.id) || d.id, ...d.data() }));
              setAppointments(prev => { const m = new Map(); [...older, ...(prev || [])].forEach(a => m.set(String(a.id), a)); return Array.from(m.values()); });
          } catch (e) { console.error('Eski randevu yükleme hatası:', e); }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, calendarYear, calendarMonth]);

  const olderRemLoadedRef = useRef(false);
  useEffect(() => {
      if (!db || !firebaseUser || olderRemLoadedRef.current) return;
      const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0]; })();
      if (String(reminderSelectedDate || '') >= cutoff.slice(0, 7) + '-01') return; // seçili ay pencerede
      olderRemLoadedRef.current = true;
      (async () => {
          try {
              const snap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'reminders'), where('date', '<', cutoff), orderBy('date', 'desc'), limit(300)));
              const older = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              setReminders(prev => { const m = new Map(); [...older, ...(prev || [])].forEach(r => m.set(String(r.id), r)); return Array.from(m.values()); });
          } catch (e) { console.error('Eski hatırlatma yükleme hatası:', e); }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, reminderSelectedDate]);
  // ============================================================================

  const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date().toISOString().split('T')[0]);
  
  // --- RANDEVU DÜZENLEME/SİLME STATE'LERİ ---
  const [isEditApptModalOpen, setIsEditApptModalOpen] = useState(false);
  const [editApptData, setEditApptData] = useState(null);

  // --- ASKIDA KALAN TAHSİLATLAR STATE'LERİ ---

  // --- ASKIDA KALAN TAHSİLATLAR STATE'LERİ ---
  const [pendingCollections, setPendingCollections] = useState([]); // TEMİZLENDİ: Örnek askıda tahsilat (8001) kaldırıldı — askıda veriler yalnızca Firebase'den çekilir.



  // --- YENİ EKLENEN: DEPO ÖDEMELERİ GÜNCELLEME STATE'LERİ ---
  const [isUpdateAllModalOpen, setIsUpdateAllModalOpen] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [updateAllStats, setUpdateAllStats] = useState(null);


  // --- GENEL ARAMA STATE'LERİ ---
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [showGlobalSearchResults, setShowGlobalSearchResults] = useState(false);

  // --- PROFİL VE KULLANICI STATE'LERİ ---
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState({
      id: 1,
      name: 'Mustafa Beşinci',
      role: 'Yönetici',
      email: 'mustafa@depoevim.com',
      phone: '0533 201 06 10',
      avatar: null,
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
  });

const handleLogin = async (e) => {
      if (e) e.preventDefault();
      let user = systemUsers.find(u => u.username === loginData.username && u.password === loginData.password);
      // DÜZELTME: Yerel liste henüz Firebase'den yüklenmemiş olabilir (yeni eklenen kullanıcılar görünmez)
      // → yerel eşleşme yoksa doğrudan Firebase'den TAZE okuma yapıp tekrar kontrol et.
      if (!user && db && firebaseUser) {
          try {
              const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'systemUsers'));
              const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              if (fresh.length) setSystemUsers(fresh);
              user = fresh.find(u => u.username === loginData.username && u.password === loginData.password);
          } catch (err) { console.error('Kullanıcı doğrulama (taze okuma) hatası:', err); }
      }
      if (user) {
          setCurrentUserProfile({...user, oldPassword: '', newPassword: '', confirmPassword: ''});
          setIsAuthenticated(true);
          setLoginError('');
          // YENİ: Giriş anında güncel cari borçların yeniden hesaplanmasını tetikle
          setAutoRefreshTick(t => t + 1);
          // YENİ EKLENDİ: Beni Hatırla işaretliyse tarayıcıya (kalıcı) kaydet
          if (rememberMe) {
              persistStore.set('depoevim_saved_user', JSON.stringify(user));
          } else {
              persistStore.remove('depoevim_saved_user');
          }
          // YENİ EKLENEN: Oturum (giriş) kaydı oluştur
          startUserSession(user);
      } else {
          setLoginError('Kullanıcı adı veya şifre hatalı!');
      }
  };

  // YENİ EKLENEN: Kullanıcı oturumu başlat (giriş anı + çevrimiçi işareti)
  const startUserSession = async (user) => {
      try {
          const sid = `sess_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          const entry = { id: sid, userName: user?.name || 'Bilinmeyen', userRole: user?.role || '', loginISO: new Date().toISOString(), logoutISO: null, online: true };
          setCurrentSessionId(sid);
          if (db && firebaseUser) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'userSessions', sid), entry);
          } else {
              setUserSessions(prev => [entry, ...prev]);
          }
      } catch (e) { console.error('Oturum başlatma hatası:', e); }
  };

  // YENİ EKLENEN: Kullanıcı oturumunu kapat (çıkış anı + çevrimdışı işareti)
  const endUserSession = async () => {
      try {
          const sid = currentSessionId;
          if (!sid) return;
          const patch = { logoutISO: new Date().toISOString(), online: false };
          if (db && firebaseUser) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'userSessions', sid), patch, { merge: true });
          } else {
              setUserSessions(prev => prev.map(s => s.id === sid ? { ...s, ...patch } : s));
          }
          setCurrentSessionId(null);
      } catch (e) { console.error('Oturum kapatma hatası:', e); }
  };

  const handleLogout = () => {
      endUserSession(); // YENİ: çıkış anını kaydet
      setIsAuthenticated(false);
      setLoginData({ username: '', password: '' });
      setRememberMe(false);
      setIsProfileDropdownOpen(false);
      persistStore.remove('depoevim_saved_user'); // Çıkışta temizle
  };

const handleAddSystemUser = async () => {
      if(!newUserData.username || !newUserData.password || !newUserData.name) return;
      if(systemUsers.some(u => u.username === newUserData.username)) {
          alert("Bu kullanıcı adı zaten mevcut.");
          return;
      }
      
      const newId = String(Date.now());
      const newUser = { id: newId, ...newUserData, avatar: null };

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'systemUsers', newId), newUser);
          } catch(e) { console.error("Kullanıcı Kayıt Hatası:", e); }
      }
      
      setIsAddUserModalOpen(false);
      setNewUserData({ username: '', password: '', name: '', role: 'Personel', email: '', phone: '' });
  };

const handleDeleteSystemUser = async (id) => {
      if(systemUsers.length === 1) return alert("Sistemde en az 1 kullanıcı kalmalıdır.");
      if(currentUserProfile.id === id) return alert("Kendi hesabınızı silemezsiniz.");

      if (db && firebaseUser) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'systemUsers', String(id)));
          } catch(e) { console.error("Kullanıcı Silme Hatası:", e); }
      }
  };

const handleUpdateSystemUser = async () => {
      if(!editUserData.username || !editUserData.password || !editUserData.name) return;
      // Aynı kullanıcı adı başkasında var mı kontrolü
      if(systemUsers.some(u => u.username === editUserData.username && String(u.id) !== String(editUserData.id))) {
          alert("Bu kullanıcı adı başka bir hesap tarafından kullanılıyor.");
          return;
      }

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'systemUsers', String(editUserData.id)), editUserData, { merge: true });
          } catch(e) { console.error("Kullanıcı Güncelleme Hatası:", e); }
      }

      // Düzenlenen kullanıcı 'kendi' oturumumuz ise profili de anında güncelle
      if(currentUserProfile.id === editUserData.id) {
          setCurrentUserProfile({...currentUserProfile, name: editUserData.name, role: editUserData.role, email: editUserData.email, phone: editUserData.phone});
      }
      
      setIsEditUserModalOpen(false);
      setEditUserData(null);
  };


// ============================================================================
// SEMBOL KÖPRÜSÜ — ORTAK GÖNDERİM YARDIMCISI
// Cariye işlenen (Tahsilat Hareketleri'nde görünen) HER tahsilatı Sembol CRM'in
// ALBARAKA defterine aktarır. Nereden girilirse girilsin (tahsilat girişi,
// askıdan atama, manuel ekleme, toplu banka yükleme, düzenleme) tek noktadan geçer.
//
// SABİT KİMLİK: `${müşteriId}_${ödemeId}` → aynı tahsilat tekrar gönderilirse
// (örn. tutar/tarih düzenlendiğinde) Sembol'de YENİ satır açılmaz, mevcut kayıt
// üzerine yazılır (setDoc + merge). Çift kayıt bu sayede imkânsızdır.
//
// NOT: Onay bekleyen (soluk / needsConfirm) tahsilatlar bakiyeye işlenmediği
// için Sembol'e de GÖNDERİLMEZ; ancak "Onayla" denildiğinde gönderilir.
// Köprü hata verirse Depoevim akışı asla bozulmaz (sembolKoprusu.js garantisi).
// ============================================================================
const sembolePaymentAktar = (customerLike, payment) => {
    try {
        if (!customerLike || !payment || !payment.id) return;      // eksik veri → gönderme
        if (payment.needsConfirm) return;                          // onay bekleyen soluk kayıt → gönderme
        sembolTahsilatGonder({
            tahsilatId: `${customerLike.id}_${payment.id}`,        // sabit kimlik (çift kayıt koruması)
            musteriAdi: customerLike.name || 'Müşteri',
            musteriNo: String(customerLike.customerNo || customerLike.id || ''),
            tutar: Number(payment.netAmount || payment.amount || 0), // kredi kartında NET tutar gider
            tarih: payment.date,
            aciklama: payment.note || '',
            kaydeden: currentUserProfile?.name || '',
        });
    } catch (sembolHata) {
        console.warn('Sembol CRM gönderimi başarısız (Depoevim kaydınız güvende):', sembolHata);
    }
};

// ============================================================================
// SEMBOL KÖPRÜSÜ — ORTAK SİLME YARDIMCISI
// Depoevim'de silinen (veya cariden askıya geri alınan) tahsilatın Sembol
// ALBARAKA defterindeki karşılığını kaldırır. Gönderimle AYNI sabit kimliği
// (`${müşteriId}_${ödemeId}`) kullanır. Kayıt Sembol'de yoksa sorun çıkmaz.
// NOT: Bu sabit kimlik düzenine geçilmeden ÖNCE gönderilmiş eski kayıtlar
// (kimliğinde Date.now() olanlar) buradan silinemez; onları Sembol CRM
// ekranından elle silmek gerekir.
// ============================================================================
const sembolePaymentSil = (customerLike, paymentId) => {
    try {
        if (!customerLike || !paymentId) return; // eksik veri → işlem yapma
        sembolTahsilatSil(`${customerLike.id}_${paymentId}`);
    } catch (sembolHata) {
        console.warn('Sembol CRM silme başarısız (Depoevim silme işleminiz güvende):', sembolHata);
    }
};


  // --- SÖZLEŞME VE PDF STATE'LERİ ---
  const [activeSettingsTab, setActiveSettingsTab] = useState('iban');
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [contractCustomer, setContractCustomer] = useState(null);
  const [contractRooms, setContractRooms] = useState([]);
  
  // --- SİSTEM AYARLARI: TAHSİLAT ORANLARI ---
  const [collectionRates, setCollectionRates] = useState({
      roomIncreaseRate: '50',
      sealFee: '200',
      interestRate: '4',
      isInterestActive: true,
      // Ay bazlı faiz oranları — anahtar 'YYYY-AyIndex'. Girilmeyen aylarda genel interestRate kullanılır.
      monthlyInterestRates: {}
  });

  const [contractSettings, setContractSettings] = useState({
      iban: 'TR90 0020 3000 0871 2889 0000 34',
      accountHolder: 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti',
      bankShortName: 'Albaraka',
      bankFullName: 'Albaraka Türk Katılım Bankası',
      ibanWarning: 'Ödeme yaparken açıklama kısmına oda numaranızı yazmayı unutmayınız.',
      clauses: [
          { id: 'm1', title: 'Madde 1 - TARAFLAR', content: 'Eşya Depolama Sözleşmesi\n\nİşbu eşya depolama sözleşmesi (bundan böyle "Sözleşme" olarak anılacaktır) aşağıda belirtilen taraflar arasında imzalanmıştır:\n\nHizmet Veren Adres: BAHÇELİEVLER MAH. YENİ SK. RAVZA APT. NO: 5 C PENDİK/İSTANBUL adresinde mukim.\n\nHizmet Veren Ad Soyad / Ünvan: Sembol Nakliyat Depoculuk Tic. Ltd. Şti.\n\nKartal Vergi Dairesi - Vergi No: 7600944287\n\nDepolatan Kişinin Ad Soyad / Ünvan: {{MUSTERI_AD}}\n\nT.C. Kimlik No / Vergi No: {{MUSTERI_TC}}\n\nDepolatan Kişinin İletişim Numarası: {{MUSTERI_TELEFON}}\n\nDepolatan Kişinin Yedek İletişim Numarası: {{MUSTERI_ALT_TELEFON}}\n\nDepolatan Kişinin Müşteri Numarası: {{MUSTERI_NUMARASI}}\n\nDepolatan Kişinin Adres: {{MUSTERI_ADRES}}\n\nBundan sonra "Depolatan kişi" olarak bahsedilecektir.' },
          { id: 'm2', title: 'Madde 2 - TANIMLAR', content: 'Depo: Hizmet Veren ile Depolatan Kişi arasında imzalanan bu sözleşmede Depolatan kişinin eşyalarının Hizmet Veren tarafından depolandığı yeri ifade eder.\n\nDepolama Hizmetinin Başlangıç Tarihi: {{GIRIS_TARIHI}}\n\nDepolanan alanın aylık ücreti KDV dahil {{AYLIK_UCRET}} TLdir.' },
          { id: 'm3', title: 'Madde 3 - SÖZLEŞMENİN KONUSU', content: 'Bu Sözleşme, Türk Borçlar Kanunu ve ilgili mevzuat hükümlerine tabi olarak, sözleşmedeki şartlar çerçevesinde Hizmet Veren ile Depolatan Kişi arasında kabul ve imza edilen, tarafların hak ve yükümlülüklerini gösteren aşağıda adresi belirtilen mülkte Hizmet Veren tarafından Depolatan Kişi\'ye ait eşyaların depolanma hizmetine İlişkin sözleşmedir.\n\nDepo Adresi:\nSapanbağları Mahallesi Düzova Sokak No:9\n\nEşyaların bulunduğu adresten olası bir zorunlu tahliye işleminde eşyaların başka bir depo adresine taşınması durumunda depolayan kişiye sözlü ve ya yazılı olarak bildirilecektir.' },
          { id: 'm4', title: 'Madde 4 - SÖZLEŞMENİN SÜRESİ', content: 'İşbu sözleşme belirtilen tarihten itibaren geçerli sayılacaktır.\n\nDepolama sözleşmesi depolayan kişinin giriş tarihinden çıkış tarihine kadar geçerlidir. Herhangi bir taahhüt zorunluluğu yoktur. Depolayan kişi istediği zaman tüm borçlarını ödeyip tüm eşyasını teslim alıp sözleşmeyi fesih edebilir.' },
          { id: 'm5', title: 'Madde 5 - DEPO ÜCRETİ', content: 'Sözleşmeye göre depolayan kişinin aylık depolama bedeli her ay giriş tarihinden itibaren düzenli olarak hizmet veren kişinin IBAN\'ına ödeme yapacaktır. Depo ücretine KDV dahildir.\n\nDepolayan kişi depo ücretini en geç giriş tarihinden 5 gün sonra yatırabilir. Depo ücretinin ödenmemesi durumunda olabilecek gecikme faizi yansıtılacaktır. Aylık ödeme kredi kartı ile yapılamaz. Hizmet veren firmanın kampanya durumu olmadığı müddetçe ödemenin IBAN yoluyla sağlanması gerekmektedir.\n\nC- Eşya Sahibi, Depo ücretini aşağıda belirtilen banka hesaba yatıracaktır.\n\nBanka Adı: {{BANKA_TAM_ADI}}\nIban: {{IBAN}}\nHesap Sahibi: {{HESAP_SAHIBI}}\n\n{{IBAN_UYARI}}' },
          { id: 'm6', title: 'Madde 6 - DEPO SORUMLULUK', content: 'Depolanacak eşyalar depoya indirilirken kısmen fotoğraf veya video kayıt altına alınacaktır. Depolanacak eşyaların içine konan eşyaların ne olduğu kaç adet olduğu ya da ne kadar değerli olduğu firmanın hizmet konusu değildir. Hizmet veren sadece depolanacak alanın güvenliğini ve depolayan kişi haricinden başka birinin girmemesini korumaktadır.\n\nHizmet Veren eşyaları Depo içinde zarar görmeyecek uygun şartlar altında saklamakla sorumludur. Ayrıca olası risklere karşı sigorta ile teminat altına almakla yükümlüdür.\n\nOlası yangın, hırsızlık, deprem gibi eşyanın uğrayacağı hasar ve kayıp rizikolarına karşı sigorta poliçesi hazırlanmamışsa Hizmet Veren zararları karşılamakla sorumludur.\n\nHizmet Veren eşyalarda meydana gelebilecek doğal eskime ve yıpranmalardan sorumlu tutulamaz.\n\nDepolatan kişi hizmet verene en az 3 gün önceden bilgi vermek koşulu ile herhangi bir depo borcu olmaksızın mesai saatleri içinde depo ziyareti yapabilir ve dilerse eşyalarının bir kısmını teslim alabilir. Depolayan kişi depoya giriş yapmadan önce Giriş - Çıkış tutanağı imzalaması gerekmektedir.\n\nHizmet veren tarafından verilen nakliyat hizmetleri ayrıca fiyatlandırılacaktır. Depolatan kişi depo ücretini veya birikmiş ödemelerini yapmadan eşyaları teslim alamaz.\n\nDepolanacak eşyalar depoya koyulduktan sonra kapılara mühür koyulup kayıt altına alınacaktır.\n\nDepolatan kişi aylık kira süresi dolduktan sonra 1 gün bile geçse bir sonraki ayın ödemesinin tamamını yapmayı taahhüt eder.\n\nHizmet veren firma depolatan kişinin kendine ait kiraladığı odaya koyduğu eşyaların içeriğini bilmediğinden dolayı gayri resmi yasal olmayan depolama içeriklerinden sorumlu değildir. Depolatan kişi tüm sorumluluğu kendi üzerine almıştır.\n\nDepo içerisinden eşya alımı için depolatan kişi kendi imkanlarıyla alır ve eski haline getirmesi gerekir. Aksi halde eski haline getirildikten sonra işçilik maaliyeti yansıtılacaktır.\n\nKapılara atılan mühürler tek kullanımlıktır. Mühür yenileme ücreti 200 TL+KDVdir.\n\nDepolanacak eşyaların içinde herhangi bir gıda malzemesi bulunmaması gerekmektedir. Bu sebepten dolayı oluşabilecek hasardan depolatan kişi sorumludur.\n\nDepolanacak eşyaların içinde bulunan döviz, hisse senedi, para, silah, ziynet eşyası ve değerli eşyalardan firmamız mesul değildir.' },
          { id: 'm7', title: 'Madde 7 - SÖZLEŞME FESHİ', content: 'Depolatan kişi depolanan eşyanın teslimi için hizmet veren firmaya en az 7 gün öncesinden bilgi vermesi halinde istediği tarihte eşyalarının nakliyesini isteyebilir.\n\nDepolatan kişi depo ücretini birbirini takip eden üç aylık ödeme döneminde ödemez ise Hizmet veren eşyaları tahliye etme hakkına sahip olacaktır. Tahliye sırasında oluşabilecek eksik ve hasarlı eşyalar hizmet veren firmanın sorumluluğunda değildir. Tahliye işleminde oluşan nakliye masrafları depolatan kişiye yansıtılacaktır.\n\nDepolatan kişi tahliyeden sonraki 3 ay boyunca güncel depo bedeli ve eklenmiş tahliye masraflarını ödemekle yükümlüdür. Ödenmemiş 3 aylık ödeme dönemi ve 3 aylık tahliye süreci tamamlanınca eşyaların duyuru yapılmaksızın ihale ile satışa sunulacaktır.\n\nSüre bitiminden önce taraflardan biri sözleşmeyi yenilemeyeceğini karşı tarafa yazılı olarak bildirmezse sözleşme aynı şartlarla hizmet bedeli bir önceki yılın fiyatının TEFE-TÜFE artış oranı dikkate alınmak suretiyle yeni kira bedeli belirlenerek otomatik yenilenecektir.\n\nToplu ödemelerde yapılan indirim kampanyası belirlenen süre için geçerlidir. Bu süreden önce eşyaların teslim alınması halinde hediye tutarı geri iade edilmeyecektir. Hediye ayları çıkarıldığında kalan ayların iadesi yapılacaktır. Kredi kartı ile yapılan toplu ödemelerde kesintiler hesaplanıp iadesi alınacaktır.\n\nNakliye hizmeti hizmet veren firmadan alınmamış ise hizmet veren firmanın kalıcı ambalajının (pat pat) eşyalar depodan çıkarken iadesinin alınması mecburidir.' },
          { id: 'm8', title: 'Madde 8 - TEBLİGAT ADRESLERİ', content: 'Hizmet verenin ve depolatan kişinin yukarda yazılı olan adresleri geçerli tebligat adresleridir. Tarafların tebligat adresinde olabilecek değişiklikler, değişimi takip eden 3 (üç) gün içerisinde diğer tarafa internet üzerinden veya yazılı olarak bildirilecektir. Bildirmediği takdirde sözleşmedeki adreslere yapılacak tebligatlar taraflara yapılmış olarak kabul edilecektir.' },
          { id: 'm9', title: 'Madde 9 - YETKİLİ MAHKEME VE İCRA DAİRESİ', content: 'İşbu Sözleşmenin, eklerinin, tadillerinin uygulanmasından veya yorumundan doğabilecek ihtilaflarda Türk Kanunları uygulanır ve taraflarca aksine bir hüküm kararlaştırılmadıkça HMK kuralları doğrultusunda yetkili mahkeme ve icra daireleri belirlenir.' },
          { id: 'm10', title: 'Madde 10 - YÜRÜRLÜK', content: 'İşbu Sözleşme taraflarca imzalandığı tarihte yürürlüğe girer ve daha erken feshedilmedikçe Sözleşmede belirtilen şekilde sona erer.\n\nİşbu Sözleşme 4 (dört) sayfadan oluşmaktadır. Sözleşmede yer almayan hususlar hakkında 6098 sayılı Borçlar Kanunu hükümleri geçerlidir.\n\nİşbu sözleşme, taraflarca tüm hususlarda mutabık kalınarak 2 nüsha olmak üzere belirtilen tarihte birlikte imza altına alınmıştır. Depolatan kişinin depolama günü depo adresine gelmediği takdirde sözleşme tarafına internet yoluyla iletilecektir ve kabul ettiği varsayılacaktır.' }
      ]
  });

  const handleClauseContentChange = (id, newContent) => {
      setContractSettings(prev => ({
          ...prev,
          clauses: prev.clauses.map(c => c.id === id ? { ...c, content: newContent } : c)
      }));
  };

  const handleOpenContract = (customer) => {
      const custRooms = rooms.filter(r => r.customerName === customer.name);
      setContractCustomer(customer);
      setContractRooms(custRooms);
      setIsContractModalOpen(true);
  };

  const renderClauseWithData = (content) => {
      let text = content;
      const roomNames = contractRooms.map(r => r.name).join(', ') || 'Belirtilmemiş';

      let totalFee = 0;
      contractRooms.forEach(r => {
          const base = Number(r.monthlyFee || 0);
          const hasKdv = r.hasKdv !== undefined ? r.hasKdv : true;
          totalFee += hasKdv ? base * 1.20 : base;
      });

      // YENİ EKLENEN: Her odayı ayrı satırda "Oda - Giriş Tarihi - KDV dahil aylık ücret" olarak dök.
      // Farklı tarihlerde girilen odalar ayrı ayrı görünür; en sonda KDV dahil toplam yazılır.
      const roomBreakdownLines = contractRooms.map(r => {
          const base = Number(r.monthlyFee || 0);
          const hasKdv = r.hasKdv !== undefined ? r.hasKdv : true;
          const kdvInclFee = Math.round(hasKdv ? base * 1.20 : base);
          const dateStr = r.entryDate ? new Date(r.entryDate).toLocaleDateString('tr-TR') : 'Belirtilmemiş';
          return `${r.name} Odası - Giriş Tarihi: ${dateStr} - Aylık Ücret (KDV Dahil): ${kdvInclFee.toLocaleString('tr-TR')} TL`;
      });
      const roomBreakdownText = roomBreakdownLines.length > 0
          ? roomBreakdownLines.join('\n') + `\n\nToplam Aylık Kira (KDV Dahil): ${Math.round(totalFee).toLocaleString('tr-TR')} TL`
          : 'Belirtilmemiş';
      // Yalnızca giriş tarihlerinin listesi (GIRIS_TARIHI yer tutucusu için)
      const entryDates = contractRooms.length > 0
          ? contractRooms.map(r => `${r.name}: ${r.entryDate ? new Date(r.entryDate).toLocaleDateString('tr-TR') : 'Belirtilmemiş'}`).join(' | ')
          : 'Belirtilmemiş';

      text = text.replace(/{{MUSTERI_AD}}/g, contractCustomer?.name || '');
      text = text.replace(/{{MUSTERI_TC}}/g, contractCustomer?.tc || 'Belirtilmemiş');
      text = text.replace(/{{MUSTERI_TELEFON}}/g, contractCustomer?.phone || 'Belirtilmemiş');
      text = text.replace(/{{MUSTERI_ALT_TELEFON}}/g, contractCustomer?.altPhone || '-');
      text = text.replace(/{{MUSTERI_ADRES}}/g, contractCustomer?.address || 'Adres Girilmemiş');
      text = text.replace(/{{ODA_NUMARASI}}/g, roomNames);
      text = text.replace(/{{MUSTERI_NUMARASI}}/g, contractCustomer?.customerNo || 'Belirtilmemiş');
      text = text.replace(/{{GIRIS_TARIHI}}/g, entryDates);
      // YENİ: Aylık ücret artık oda oda dökümlü (KDV dahil) + toplam olarak yazılır
      text = text.replace(/{{AYLIK_UCRET}}/g, roomBreakdownText);
      text = text.replace(/{{BANKA_TAM_ADI}}/g, contractSettings.bankFullName);
      text = text.replace(/{{IBAN}}/g, contractSettings.iban);
      text = text.replace(/{{HESAP_SAHIBI}}/g, contractSettings.accountHolder);
      text = text.replace(/{{IBAN_UYARI}}/g, contractSettings.ibanWarning);

      return text;
  };

  const handlePrintContract = () => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      const roomNames = contractRooms.map(r => r.name).join(', ') || 'Belirtilmemiş';

      let totalFee = 0;
      contractRooms.forEach(r => {
          const base = Number(r.monthlyFee || 0);
          const hasKdv = r.hasKdv !== undefined ? r.hasKdv : true;
          totalFee += hasKdv ? base * 1.20 : base;
      });

      // YENİ EKLENEN: Her odayı ayrı satırda "Oda - Giriş Tarihi - KDV dahil aylık ücret" olarak dök (PDF/yazdırma)
      const roomBreakdownLines = contractRooms.map(r => {
          const base = Number(r.monthlyFee || 0);
          const hasKdv = r.hasKdv !== undefined ? r.hasKdv : true;
          const kdvInclFee = Math.round(hasKdv ? base * 1.20 : base);
          const dateStr = r.entryDate ? new Date(r.entryDate).toLocaleDateString('tr-TR') : 'Belirtilmemiş';
          return `${r.name} Odası - Giriş Tarihi: ${dateStr} - Aylık Ücret (KDV Dahil): ${kdvInclFee.toLocaleString('tr-TR')} TL`;
      });
      const roomBreakdownText = roomBreakdownLines.length > 0
          ? roomBreakdownLines.join('\n') + `\n\nToplam Aylık Kira (KDV Dahil): ${Math.round(totalFee).toLocaleString('tr-TR')} TL`
          : 'Belirtilmemiş';
      const entryDates = contractRooms.length > 0
          ? contractRooms.map(r => `${r.name}: ${r.entryDate ? new Date(r.entryDate).toLocaleDateString('tr-TR') : 'Belirtilmemiş'}`).join(' | ')
          : 'Belirtilmemiş';

      const processedClauses = contractSettings.clauses.map(clause => {
          let text = clause.content;
          text = text.replace(/{{MUSTERI_AD}}/g, contractCustomer?.name || '');
          text = text.replace(/{{MUSTERI_TC}}/g, contractCustomer?.tc || 'Belirtilmemiş');
          text = text.replace(/{{MUSTERI_TELEFON}}/g, contractCustomer?.phone || 'Belirtilmemiş');
          text = text.replace(/{{MUSTERI_ALT_TELEFON}}/g, contractCustomer?.altPhone || '-');
          text = text.replace(/{{MUSTERI_ADRES}}/g, contractCustomer?.address || 'Adres Girilmemiş');
          text = text.replace(/{{ODA_NUMARASI}}/g, roomNames);
          text = text.replace(/{{MUSTERI_NUMARASI}}/g, contractCustomer?.customerNo || 'Belirtilmemiş');
          text = text.replace(/{{GIRIS_TARIHI}}/g, entryDates);
          text = text.replace(/{{AYLIK_UCRET}}/g, roomBreakdownText);
          text = text.replace(/{{BANKA_TAM_ADI}}/g, contractSettings.bankFullName);
          text = text.replace(/{{IBAN}}/g, contractSettings.iban);
          text = text.replace(/{{HESAP_SAHIBI}}/g, contractSettings.accountHolder);
          text = text.replace(/{{IBAN_UYARI}}/g, contractSettings.ibanWarning);
          return { ...clause, content: text };
      });

      // Madde içeriklerini Hamdi sözleşmesi gibi bold satırlar + normal paragraflar olarak render et
      const clausesHtml = processedClauses.map(clause => {
          const lines = clause.content.split('\n');
          const linesHtml = lines.map(line => {
              const trimmed = line.trim();
              if (!trimmed) return '<br/>';
              // "Anahtar: Değer" formatındaki satırlar: anahtar kısmı bold
              const colonIdx = trimmed.indexOf(':');
              if (colonIdx > 0 && colonIdx < 60) {
                  const key = trimmed.substring(0, colonIdx);
                  const val = trimmed.substring(colonIdx + 1).trim();
                  // Sadece kısa anahtar kelimeler için bold uygula (uzun cümleler değil)
                  if (key.split(' ').length <= 8) {
                      return val
                          ? `<p><strong>${key}:</strong> ${val}</p>`
                          : `<p><strong>${key}:</strong></p>`;
                  }
              }
              return `<p>${trimmed}</p>`;
          }).join('');
          return `
              <div class="clause">
                  <h3>${clause.title}</h3>
                  ${linesHtml}
              </div>
          `;
      }).join('');

      // Footer: tfoot tekniği ile her sayfada tekrar eder
const footerHtml = `
          <div style="padding: 0 24px;">
          <table style="width:100%; border-collapse:collapse; border:none; font-family:Arial,sans-serif; font-size:9pt;">
              <tr>
                  <td style="width:33%; vertical-align:bottom; padding:0; border:none;">
                      <div style="line-height:1.7;">
                          <div style="font-weight:bold;">HİZMET VEREN</div>
                          <div><strong>Ad Soyad / Ünvan:</strong> ${contractSettings.accountHolder}</div>
                          <div><strong>İmza Yetkili Kişi Ad Soyad:</strong></div>
                          <div><strong>İmza:</strong></div>
                          <div style="margin-top:6px;">
                              <img src="https://www.sembolevdeneve.com/crm/uploads/ka%C5%9Fe.jpg" style="width:110px; mix-blend-mode:multiply; opacity:0.95;" /><br/><br/>
                          </div>
                      </div>
                  </td>
                  <td style="width:34%; vertical-align:bottom; text-align:center; padding-bottom:4px; border:none;">
                      <img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" style="height:40px; object-fit:contain;" /><br/><br/>
                  </td>
                  <td style="width:33%; vertical-align:bottom; padding:0; border:none;">
                      <div style="line-height:1.7;">
                          <div style="font-weight:bold;">DEPOLATAN KİŞİ</div>
                          <div><strong>Ad Soyad / Ünvan:</strong> ${contractCustomer?.name}</div>
                          <div><strong>İmza Yetkili Kişi Ad Soyad:</strong></div>
                          <div><strong>İmza:</strong><br/><br/><br/><br/><br/><br/></div>
                      </div>
                  </td>
              </tr>
          </table>
          </div>
      `;

iframe.contentWindow.document.open();
      
      const fileName = contractCustomer?.name ? normalizeStr(contractCustomer.name).replace(/\s+/g, '-') : 'musteri';
      
      iframe.contentWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
              <title>${sanitizePdfName(customer?.name || fileName)}</title>
              <style>
                  @page { size: A4 portrait; margin: 15mm 15mm 55mm 15mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}

                  /* Temel font — Hamdi sözleşmesiyle aynı */
                  body {
                      font-family: Arial, sans-serif;
                      font-size: 10pt;
                      color: #333;
                      line-height: 1.55;
                      margin: 0;
                      padding: 0;
                  }

                  /* Dış çerçeve kutusu — Hamdi sözleşmesindeki beyaz kart görünümü */
                  .page-box {
                      border: 1px solid #d0d0d0;
                      border-radius: 4px;
                      padding: 22px 24px;
                      background: #fff;
                  }

                  /* Büyük başlık */
                  .doc-title {
                      text-align: center;
                      font-size: 15pt;
                      font-weight: bold;
                      margin-bottom: 20px;
                      color: #111;
                  }

                  /* Madde başlıkları — bold, siyah */
                  .clause { margin-bottom: 16px; page-break-inside: avoid; }
                  .clause h3 {
                      font-size: 10.5pt;
                      font-weight: bold;
                      color: #111;
                      margin: 0 0 5px 0;
                      padding: 0;
                  }

                  /* Normal paragraflar */
                  .clause p {
                      margin: 0 0 3px 0;
                      text-align: justify;
                      color: #333;
                  }

                  /* Bold anahtar + değer satırları */
                  .clause p strong {
                      color: #111;
                      font-weight: bold;
                  }

                  /* Filigran */
                  .watermark {
                      position: fixed;
                      top: 50%; left: 50%;
                      transform: translate(-50%, -50%) rotate(-45deg);
                      font-size: 72pt;
                      font-weight: bold;
                      color: rgba(0,0,0,0.03);
                      z-index: -1;
                      white-space: nowrap;
                      pointer-events: none;
                  }

                  /* tfoot her sayfada tekrar eder */
                  table.page-table { width: 100%; border-collapse: collapse; }
                  table.page-table > thead > tr > td,
                  table.page-table > tbody > tr > td,
                  table.page-table > tfoot > tr > td { border: none; padding: 0; vertical-align: top; }

tfoot.repeat-footer > tr > td {
                      padding-top: 25px;
                      padding-bottom: 25px;
                      border-top: 1px solid #bbb;
                  }
              </style>
          </head>
          <body>
              <div class="watermark">Depoevim</div>

              <table class="page-table">
                  <thead><tr><td style="height:0;padding:0;"></td></tr></thead>
                  <tfoot class="repeat-footer">
                      <tr><td>${footerHtml}</td></tr>
                  </tfoot>
                  <tbody>
                      <tr>
                          <td>
                              <div class="page-box">
                                  <div class="doc-title">Eşya Depolama Sözleşmesi</div>
                                  ${clausesHtml}
                              </div>
                          </td>
                      </tr>
                  </tbody>
              </table>
          </body>
          </html>
      `);
      iframe.contentWindow.document.close();
      
setTimeout(() => {
          // Yazdırma anında sayfa başlığını değiştirip PDF ismini ayarlıyoruz
          const originalTitle = document.title;
          const fileName = contractCustomer?.name ? normalizeStr(contractCustomer.name).replace(/\s+/g, '-') : 'musteri';
          document.title = `musteri_${fileName}_sozlesme`;
          
          iframe.contentWindow.focus();
          iframe.contentWindow.print(); // PDF olarak kaydetme ekranını doğrudan tetikler
          
          // Yazdırma penceresi açıldıktan sonra orijinal başlığı geri al
          document.title = originalTitle;
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
      }, 500);
};



  // YENİ EKLENEN: Üç DepoEvim bilgilendirmesinin başlık ve içeriğini oda bilgilerine göre üretir.
  // type: 'self' (müşteri kendi alma) | 'exit' (başka nakliyeci ile çıkış) | 'entry' (başka nakliyeci ile giriş)
  const getInfoNotifyContent = (type) => {
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      const custName = customer?.name || room?.customerName || '.....................';
      const roomName = room?.name || '..........';
      const m3 = room?.m3 ? `${room.m3} m³` : '';
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';

      // Kalıcı ambalaj ücreti odanın m³'üne göre
      let ambalaj = '';
      const v = Number(room?.m3 || 0);
      if (v <= 15) ambalaj = '15 m³ – 2.000 TL + KDV';
      else if (v <= 22) ambalaj = '22 m³ – 3.000 TL + KDV';
      else ambalaj = '30 m³ – 4.000 TL + KDV';

      if (type === 'self') {
          return {
              title: 'Müşteri Kendisi Eşya Alma Bilgilendirmesi',
              heading: 'DEPO ÇIKIŞI / TESLİM BİLGİLENDİRMESİ',
              rules: [
                  'Depo borcunuzun tamamının ödenmiş olması gerekmektedir.',
                  'Eşya teslimi sırasında depolayan kişinin (sizin) bizzat bulunması gerekmektedir.',
                  'Eşyalar depodan çıkmadan önce teslim tutanağının ıslak imza ile imzalanması gerekmektedir.',
                  'Depo çalışma saatleri 10.00 – 17.00 arasıdır; Pazar günleri kapalıdır.',
                  'Eşyaların alınma süresi maksimum 2 saattir; bu sürenin aşılması halinde mesai ücreti alınır.',
                  'Eşyanın tamamı alınmadığı sürece çıkış işlemi tamamlanmayacaktır.',
                  `Daha önce nakliye hizmeti firmamızdan alındıysa kalıcı ambalaj iadesi ya da ücreti ödenmelidir. (Oda: ${roomName} ${m3} → ${ambalaj})`
              ]
          };
      }
      if (type === 'exit') {
          return {
              title: 'Başka Nakliyeci ile Çıkış Bilgilendirmesi',
              heading: 'FARKLI FİRMA / MÜŞTERİ TARAFINDAN DEPO ÇIKIŞI',
              rules: [
                  'Depolayan kişinin depo borcunun tamamı ödenmiş olmalıdır.',
                  'Depolayan kişinin eşya teslimi sırasında bulunması gerekmektedir.',
                  'Eşyalar çıkmadan önce teslim tutanağı ıslak imza ile imzalanmalıdır.',
                  'Depo sorumluluğumuz yalnızca depoyu açma ve kapama işlemidir.',
                  'Başka nakliye hizmeti için minimum 48 saat öncesinden randevu alınması gerekmektedir.',
                  'Sembol Nakliyat dışında bir firmadan hizmet alınırsa; depo açıldığı andan itibaren oluşabilecek hasar, eksik/fazla eşya vb. durumlardan depolayan kişi sorumludur.',
                  'Ümraniye, Kartal ve Çekmeköy depoları fabrikada bulunduğundan, dışarıdan gelen nakliye personelinin sigortalı olması zorunludur.',
                  'Bu depolardan çıkacak eşyalar için nakliyecinin, gelecek personelin sigorta giriş belgelerini 1 gün önceden firmamıza iletmesi gerekmektedir.',
                  'Depo çalışma saatleri 10.00 – 17.00; Pazar kapalıdır.',
                  'Eşyaların alınma süresi maksimum 2 saattir; aşılırsa mesai ücreti alınır.',
                  'Eşyanın tamamı alınmadığı sürece çıkış işlemi yapılmaz.',
                  'Taşıma sırasında oluşabilecek iş güvenliği ve depoya hasar durumlarından depolayan kişi sorumludur.',
                  `Nakliye hizmeti daha önce firmamızdan alındıysa kalıcı ambalaj iadesi/ücreti mecburidir. (Oda: ${roomName} ${m3} → ${ambalaj})`
              ]
          };
      }
      // entry
      return {
          title: 'Başka Nakliyeci ile Giriş Bilgilendirmesi',
          heading: 'FARKLI FİRMA / MÜŞTERİ TARAFINDAN DEPO GİRİŞİ',
          rules: [
              'Eşya girişi sırasında depolayan kişinin bulunması gerekmektedir.',
              'Giriş öncesi giriş tutanağı ıslak imza ile imzalanmalıdır.',
              'Depo sorumluluğumuz yalnızca depoyu açma ve kapama işlemidir.',
              'Başka nakliye ile giriş için minimum 48 saat öncesinden randevu alınması gerekmektedir.',
              'Sembol Nakliyat dışında bir firmayla giriş yapılırsa; taşıma sırasında ve depo içinde/çevresinde oluşabilecek tüm hasarlardan nakliye firması ve depolayan kişi sorumludur.',
              'Ümraniye, Kartal ve Çekmeköy depolarına giren dış nakliye personelinin sigortalı olması zorunludur; sigorta giriş belgeleri 1 gün önceden firmamıza iletilmelidir.',
              'Depo çalışma saatleri 10.00 – 17.00; Pazar kapalıdır.',
              `İlgili oda: ${roomName} ${m3}`
          ]
      };
  };

  const buildInfoNotifyHtml = (type) => {
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      const custName = customer?.name || room?.customerName || '.....................';
      const roomName = room?.name || '..........';
      const today = new Date().toLocaleDateString('tr-TR');
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';
      const c = getInfoNotifyContent(type);
      const rulesHtml = c.rules.map((r, i) => `<li>${r}</li>`).join('');

      return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>DepoEvim Bilgilendirme</title><style>
        @page { size:A4; margin:14mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}} * { box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }
        html,body { height:auto; }
        body { color:#1f2937; line-height:1.45; font-size:11.5px; }
        .head { text-align:center; border-bottom:3px solid #dc2626; padding-bottom:8px; margin-bottom:14px; }
        .head .brand { font-size:26px; font-weight:900; color:#111827; } .head .brand span{ color:#dc2626; }
        .head .sub { font-size:10px; letter-spacing:3px; color:#6b7280; text-transform:uppercase; }
        h1 { text-align:center; color:#dc2626; font-size:15px; margin:8px 0 4px; }
        .meta { text-align:center; font-size:10.5px; color:#6b7280; margin-bottom:12px; }
        .info-box { border:1px solid #e5e7eb; background:#f9fafb; border-radius:8px; padding:8px 12px; margin-bottom:12px; font-size:11px; }
        .info-box b { color:#111827; }
        ol { padding-left:16px; margin:4px 0; } ol li { margin-bottom:4px; font-size:11px; }
        .sign-row { display:flex; justify-content:space-between; margin-top:26px; }
        .sign-box { width:45%; text-align:center; } .sign-line { border-top:1.5px solid #111827; padding-top:6px; font-weight:700; font-size:11px; }
        .foot { margin-top:22px; text-align:center; font-size:9px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:8px; }
      </style></head><body>
        <div class="head"><img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" style="height:42px;object-fit:contain;display:block;margin:0 auto;" /></div>
        <h1>${c.heading}</h1>
        <div class="meta">Tarih: ${today}</div>
        <div class="info-box">Müşteri: <b>${custName}</b> &nbsp;|&nbsp; Oda No: <b>${roomName}</b> &nbsp;|&nbsp; Müşteri No: <b>${customer?.customerNo || '-'}</b></div>
        <div style="font-weight:700;margin-bottom:8px;">Talimatlar &amp; Kurallar</div>
        <ol>${rulesHtml}</ol>
        <div class="sign-row">
          <div class="sign-box"><div class="sign-line">Müşteri / İlgili Kişi Ad Soyad - İmza</div></div>
          <div class="sign-box"><div class="sign-line">${companyName} / Kaşe-İmza</div></div>
        </div>
        <div class="foot"><b>${companyName}</b><br/>Bahçelievler Mah. Yeni Sokak No:5 C Pendik / İstanbul · 0(216) 390 89 99 · www.sembolevdeneve.com</div>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
      </body></html>`;
  };

  const handlePrintInfoNotify = (type) => {
      const html = buildInfoNotifyHtml(type);
      const iframe = document.createElement('iframe');
      iframe.style.position='fixed'; iframe.style.right='0'; iframe.style.bottom='0'; iframe.style.width='0'; iframe.style.height='0'; iframe.style.border='0';
      document.body.appendChild(iframe);
      const _infoCustomer = customers.find(c => c.name === selectedRoomDetail?.customerName);
      setPdfFileName(_infoCustomer?.name || selectedRoomDetail?.customerName || 'Belge'); const doc = iframe.contentWindow.document; doc.open(); doc.write(html); doc.close();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 60000);
  };

  const handleShareInfoNotify = (type) => {
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      const c = getInfoNotifyContent(type);
      const rulesText = c.rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';
      const custName = customer?.name || room?.customerName || '';
      const text = `📄 *DEPOEVİM ${c.heading}*\n\nDeğerli müşterimiz *${custName}*,\nOda No: *${room?.name || '-'}*\n\n*Talimatlar & Kurallar:*\n${rulesText}\n\nAnlayışınız için teşekkür ederiz.\n${companyName}\nDepoEvim`;
      const encoded = encodeURIComponent(text);
      let rawPhone = String(customer?.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);
      window.open(`https://wa.me/90${rawPhone}?text=${encoded}`, '_blank');
  };

  const handleCustomerSelfPickupNotification = () => {
      setIsTutanakDropdownOpen(false);
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      
      if (!room || !customer) {
          alert("Oda veya müşteri bilgisi bulunamadı!");
          return;
      }

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const d = new Date();
      const todayStr = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      
      const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>${sanitizePdfName(customer.name)}</title>
              <style>
                  @page { size: A4 portrait; margin: 20mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
                  body { font-family: 'Arial', sans-serif; line-height: 1.6; font-size: 11pt; color: #000; margin: 0; padding: 0; }
                  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1bc5bd; padding-bottom: 10px; }
                  .logo { font-size: 36px; font-weight: 900; margin-bottom: 5px; }
                  .logo .black { color: #1f2937; }
                  .logo .blue { color: #0ea5e9; }
                  .subtitle { font-size: 11pt; color: #64748b; font-weight: bold; letter-spacing: 2px; margin-bottom: 10px; }
                  .title { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 20px; text-decoration: underline; }
                  .info-box { border: 1px solid #e2e8f0; padding: 15px; margin-bottom: 25px; border-radius: 8px; background-color: #f8fafc; }
                  .content-list { margin-bottom: 30px; padding-left: 20px; }
                  .content-list li { margin-bottom: 10px; text-align: justify; }
                  .price-list { margin-top: 5px; font-weight: bold; }
                  .footer { display: flex; justify-content: flex-end; margin-top: 30px; }
                  .signature-box { text-align: center; width: 250px; }
                  .sig-title { font-weight: bold; margin-bottom: 10px; }
                  .sig-name { margin-top: 10px; font-size: 11pt; }
                  .sig-line { border-bottom: 1px solid #000; margin-top: 40px; width: 80%; margin-left: auto; margin-right: auto; }
                  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80pt; font-weight: bold; color: rgba(0, 0, 0, 0.03); z-index: -1; }
              </style>
          </head>
          <body>
              <div class="watermark">Depoevim</div>
              <div class="header">
                  <div class="logo"><img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" style="height:44px;object-fit:contain;display:block;margin:0 auto;" /></div>
                  <div class="subtitle">EŞYA DEPOLAMA</div>
              </div>
              
              <div class="title">FARKLI FİRMA VEYA MÜŞTERİ TARAFINDAN DEPO ÇIKIŞLARI<br/>Talimatlar & Kurallar</div>
              
              <div class="info-box">
                  <strong>Müşteri Adı Soyadı:</strong> ${customer.name}<br/>
                  <strong>Müşteri No / Telefon:</strong> ${customer.customerNo} / ${customer.phone}<br/>
                  <strong>Oda Numarası:</strong> ${room.name} <br/>
                  <strong>Tarih:</strong> ${todayStr}
              </div>

              <ol class="content-list">
                  <li>Depolayan kişinin depo borcunun tamamı ödenmiş olması gerekmektedir.</li>
                  <li>Depolayan kişinin eşya teslim sırasında bulunması gerekmektedir.</li>
                  <li>Eşyalar depodan çıkış yapmadan depolayan kişi teslim tutanağını ıslak imza ile imzalaması gerekmektedir.</li>
                  <li>Depo sorumluluğumuz yalnızca depoyu açma ve kapama işlemi yapmaktır.</li>
                  <li>Depolayan kişi başka nakliye hizmeti için minimum 48 saat öncesinden haber verip randevu alması gerekmektedir.</li>
                  <li>Depolayan kişi, Sembol Nakliyat dışında başka bir firmadan hizmet alır ise, deposu açıldığı andan itibaren oluşabilecek hasar, eksik eşya veya fazla eşya alınması vb. durumlarda depolayan kişi sorumludur.</li>
                  <li>Ümraniye, Kartal ve Çekmeköy depolar fabrikada bulunduğundan dolayı dışarıdan gelen nakliye personelinin sigortalı olması zorunludur.</li>
                  <li>Ümraniye, Kartal ve Çekmeköy deposundan çıkarılacak eşyalar için dışarıdan gelen nakliyeci 1 gün öncesinden gelecek personellerin sigorta giriş belgelerini firmamıza iletmesi gerekmektedir.</li>
                  <li>Depo çalışma saatleri: 10.00-17.00. Pazar günleri kapalıdır.</li>
                  <li>Depodan eşyaların alınma süresi maksimum 2 saattir. Bu sürenin uzaması durumunda mesai ücreti alınması gerekmektedir.</li>
                  <li>Eşyanın tamamı alınmadığı süre zarfında çıkış işlemi yapılmayacaktır.</li>
                  <li>Taşıma sırasında oluşabilecek iş güvenliği ve depoya hasar durumlarından depolayan kişi sorumludur.</li>
                  <li>Depolayan kişi daha önce nakliye hizmetini depo firmasından almış ise kalıcı ambalaj iadesi ya da ücretini ödemek mecburidir.</li>
                  <li>Kalıcı Ambalaj Ücretleri:
                      <ul class="price-list">
                          <li>15 m³ - 2.000 TL + KDV</li>
                          <li>22 m³ - 3.000 TL + KDV</li>
                          <li>30 m³ - 4.000 TL + KDV</li>
                      </ul>
                  </li>
              </ol>

              <div class="footer">
                  <div class="signature-box">
                      <div class="sig-title">Depolayan Kişinin Ad Soyad ve İmzası</div>
                      <div class="sig-name">${customer.name}</div>
                      <div class="sig-line"></div>
                  </div>
              </div>
          </body>
          </html>
      `;

      setPdfFileName(customer?.name || 'Tutanak');
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(htmlContent);
      iframe.contentWindow.document.close();

      setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
          
          const text = `Sayın ${customer.name},\n\n*${room.name}* numaralı odanız için "Farklı Firma veya Müşteri Tarafından Depo Çıkışları - Talimatlar ve Kurallar" belgesi oluşturulmuştur.\n\nİlgili PDF belgesi sistemimiz üzerinden hazırlanmış olup tarafınıza iletilmek üzere kaydedilmiştir. Lütfen belgeyi inceleyip onaylayınız.\n\nİyi günler dileriz.`;
          const encodedText = encodeURIComponent(text);
          let waPhone = customer.phone.replace(/\D/g, '');
          if (waPhone.length === 10) waPhone = '90' + waPhone;
          else if (waPhone.length === 11 && waPhone.startsWith('0')) waPhone = '90' + waPhone.substring(1);
          
          window.open(`https://wa.me/${waPhone}?text=${encodedText}`, '_blank');
      }, 500);
  };

  const handleExternalTransportEntry = () => {
      setIsTutanakDropdownOpen(false);
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      
      if (!room || !customer) {
          alert("Oda veya müşteri bilgisi bulunamadı!");
          return;
      }

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const d = new Date();
      const todayStr = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      
      const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>${sanitizePdfName(customer.name)}</title>
              <style>
                  @page { size: A4 portrait; margin: 20mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
                  body { font-family: 'Arial', sans-serif; line-height: 1.6; font-size: 11pt; color: #000; margin: 0; padding: 0; }
                  .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1bc5bd; padding-bottom: 15px; }
                  .logo { font-size: 36px; font-weight: 900; margin-bottom: 5px; }
                  .logo .black { color: #1f2937; }
                  .logo .blue { color: #0ea5e9; }
                  .subtitle { font-size: 11pt; color: #64748b; font-weight: bold; letter-spacing: 2px; margin-bottom: 15px; }
                  .title { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 25px; text-decoration: underline; }
                  .info-box { border: 1px solid #e2e8f0; padding: 15px; margin-bottom: 25px; border-radius: 8px; background-color: #f8fafc; }
                  .content-list { margin-bottom: 40px; padding-left: 20px; }
                  .content-list li { margin-bottom: 12px; text-align: justify; }
                  .footer { display: flex; justify-content: flex-end; margin-top: 40px; }
                  .signature-box { text-align: center; width: 250px; }
                  .sig-title { font-weight: bold; margin-bottom: 10px; }
                  .sig-name { margin-top: 10px; font-size: 11pt; }
                  .sig-line { border-bottom: 1px solid #000; margin-top: 40px; width: 80%; margin-left: auto; margin-right: auto; }
                  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80pt; font-weight: bold; color: rgba(0, 0, 0, 0.03); z-index: -1; }
              </style>
          </head>
          <body>
              <div class="watermark">Depoevim</div>
              <div class="header">
                  <div class="logo"><img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" style="height:44px;object-fit:contain;display:block;margin:0 auto;" /></div>
                  <div class="subtitle">EŞYA DEPOLAMA</div>
              </div>
              
              <div class="title">DEPOEVİM FARKLI FİRMA İLE DEPOYA EŞYA GİRİŞ TUTANAĞI</div>
              
              <div class="info-box">
                  <strong>Müşteri Adı Soyadı:</strong> ${customer.name}<br/>
                  <strong>Müşteri No / Telefon:</strong> ${customer.customerNo} / ${customer.phone}<br/>
                  <strong>Oda Numarası:</strong> ${room.name} <br/>
                  <strong>Tarih:</strong> ${todayStr}
              </div>

              <ol class="content-list">
                  <li>Depolayan kişi deponun ilk ayını ödemesini eşya depoya yerleşmeden yapmalıdır.</li>
                  <li>Depolayan kişinin eşya yerleştirme sırasında bulunması gerekmektedir.</li>
                  <li>Eşyalar depodan giriş yapmadan depolayan kişi sözleşmeyi imzalaması gerekmektedir.</li>
                  <li>Depo sorumlumuz yalnızca depoyu açma ve kapama işlemi yapmaktadır.</li>
                  <li>Depolayan kişi başka nakliye hizmeti için minimum 48 saat öncesinden haber ve randevu alması gerekmektedir.</li>
                  <li>Depolayan kişi, Sembol Nakliyat dışında başka bir firmadan hizmet alır ise, deposu açıldığı andan itibaren oluşabilecek hasar, eksik eşya veya fazla eşya alınması vb. durumlarında depolayan kişi sorumludur.</li>
                  <li>Ümraniye ve Kartal ve Çekmeköy’deki depolar fabrika olduğundan dolayı dışardan gelen nakliye personelinin sigortalı olması zorunludur.</li>
                  <li>Ümraniye ve Kartal ve Çekmeköy deposuna getirilecek eşyalar için dışardan gelen nakliyeci 1 gün öncesinden gelecek personellerin sigorta giriş belgelerini firmamıza iletmesi gerekmektedir.</li>
                  <li>Depo çalışma saatleri: 10:00 – 17:00 saatleri arasındadır. Pazar günleri kapalıdır.</li>
                  <li>Depoya eşyaların yerleştirme süresi maksimum 2 saattir. Bu sürenin uzaması durumunda mesai ücreti alınması gerekmektedir.</li>
                  <li>Taşıma sırasında oluşabilecek iş güvenliği, asansör hasarı ve depoya hasar durumlarından depoyu kiralayan kişi sorumludur.</li>
              </ol>

              <div class="footer">
                  <div class="signature-box">
                      <div class="sig-title">Depolayan Kişinin Ad Soyad ve İmzası</div>
                      <div class="sig-name">${customer.name}</div>
                      <div class="sig-line"></div>
                  </div>
              </div>
          </body>
          </html>
      `;

      setPdfFileName(customer?.name || 'Tutanak');
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(htmlContent);
      iframe.contentWindow.document.close();

      setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
          
          const text = `Sayın ${customer.name},\n\n*${room.name}* numaralı odanız için "Farklı Firma İle Depoya Eşya Giriş Tutanağı" oluşturulmuştur. \n\nİlgili PDF belgesi sistemimiz üzerinden hazırlanmış olup tarafınıza iletilmek üzere kaydedilmiştir. Lütfen belgeyi inceleyip onaylayınız.\n\nİyi günler dileriz.`;
          const encodedText = encodeURIComponent(text);
          let waPhone = customer.phone.replace(/\D/g, '');
          if (waPhone.length === 10) waPhone = '90' + waPhone;
          else if (waPhone.length === 11 && waPhone.startsWith('0')) waPhone = '90' + waPhone.substring(1);
          
          window.open(`https://wa.me/${waPhone}?text=${encodedText}`, '_blank');
      }, 500);
  };

  const handleDamageReportDocument = () => {
      setIsTutanakDropdownOpen(false);
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      
      if (!room || !customer) {
          alert("Oda veya müşteri bilgisi bulunamadı!");
          return;
      }

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>${sanitizePdfName(customer.name)}</title>
              <style>
                  @page { size: A4 portrait; margin: 20mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
                  body { font-family: 'Arial', sans-serif; line-height: 1.8; font-size: 13pt; color: #000; margin: 0; padding: 0; position: relative; min-height: 250mm; }
                  .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e30a17; padding-bottom: 15px; }
                  .logo-text { color: #e30a17; font-size: 36px; font-weight: 900; margin: 0 0 5px 0; letter-spacing: 1px; }
                  .subtitle { font-size: 14pt; color: #000; font-weight: bold; margin: 0; }
                  .title { font-size: 16pt; font-weight: bold; text-align: center; margin: 40px 0; text-decoration: underline; }
                  .content { text-align: justify; margin-bottom: 50px; font-size: 14pt; line-height: 2; }
                  .form-group { margin-bottom: 20px; font-weight: bold; }
                  .flex-line { display: flex; align-items: flex-end; }
                  .footer { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 11pt; border-top: 1px solid #ccc; padding-top: 15px; color: #333; line-height: 1.5; }
                  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80pt; font-weight: bold; color: rgba(0, 0, 0, 0.03); z-index: -1; }
              </style>
          </head>
          <body>
              <div class="watermark">Sembol Nakliyat</div>
              <div class="header">
                  <h1 class="logo-text">SEMBOL NAKLİYAT</h1>
                  <h3 class="subtitle">EVDEN EVE - ASANSÖRLÜ TAŞIMA - DEPOLAMA</h3>
              </div>
              
              <div class="title">DEPOEVİM NAKLİYE HASAR TUTANAĞI</div>
              
              <div class="content">
                  <p>
                      Depoevim firmasının deposunda bulunan <strong>${room.name}</strong> oda numaralı <strong>${customer.name}</strong> adlı müşteriye ait olan eşyaları teslim alırken taşıma sırasında deponun içinde ve çevresinde oluşabilecek tüm hasarlardan sorumlu olduğumu taahhüt ederim.
                  </p>
                  
                  <div style="margin-top: 60px;">
                      <div class="form-group flex-line">
                          <span style="white-space: nowrap;">Nakliye Firması Ünvanı:</span> <span style="flex: 1; border-bottom: 1px dotted #000; margin-left: 10px;">&nbsp;</span>
                      </div>
                      <div class="form-group flex-line">
                          <span style="white-space: nowrap;">Nakliye Firması VKN:</span> <span style="flex: 1; border-bottom: 1px dotted #000; margin-left: 10px;">&nbsp;</span>
                      </div>
                      <div class="form-group flex-line" style="margin-top: 40px;">
                          <span style="white-space: nowrap;">Nakliye Firması Yetkili Kişi İsim Soyisim İmza:</span> <span style="flex: 1; border-bottom: 1px dotted #000; margin-left: 10px;">&nbsp;</span>
                      </div>
                  </div>
              </div>

              <div class="footer">
                  <strong>SEMBOL NAKLİYAT DEPOCULUK TİC.LTD.ŞTİ.</strong><br/>
                  Bahçelievler mah. Yeni sokak No 5 C Pendik / İstanbul<br/>
                  0(216) 390 89 99 / 0(554) 726 16 61<br/>
                  www.sembolevdeneve.com
              </div>
          </body>
          </html>
      `;

      setPdfFileName(customer?.name || 'Tutanak');
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(htmlContent);
      iframe.contentWindow.document.close();

      setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
          
          const text = `Sayın ${customer.name},\n\n*${room.name}* numaralı odanız için "Nakliye Hasar Tutanağı" oluşturulmuştur.\n\nİlgili PDF belgesi sistemimiz üzerinden hazırlanmış olup tarafınıza iletilmek üzere kaydedilmiştir. Lütfen belgeyi inceleyip nakliye firmasına imzalattığınızdan emin olunuz.\n\nİyi günler dileriz.`;
          const encodedText = encodeURIComponent(text);
          let waPhone = customer.phone.replace(/\D/g, '');
          if (waPhone.length === 10) waPhone = '90' + waPhone;
          else if (waPhone.length === 11 && waPhone.startsWith('0')) waPhone = '90' + waPhone.substring(1);
          
          window.open(`https://wa.me/${waPhone}?text=${encodedText}`, '_blank');
      }, 500);
  };

  const handleProxyDocument = () => {
      setIsTutanakDropdownOpen(false);
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      
      if (!room || !customer) {
          alert("Oda veya müşteri bilgisi bulunamadı!");
          return;
      }

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const d = new Date();
      const todayStr = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      
      // Müşterinin vekili varsa ismini yaz, yoksa noktalı boşluk bırak
      const proxyName = customer.proxyName || '......................................................';
      const proxyTc = customer.proxyTc || '...........................';

      const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>${sanitizePdfName(customer.name)}</title>
              <style>
                  @page { size: A4 portrait; margin: 20mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
                  body { font-family: 'Arial', sans-serif; line-height: 1.8; font-size: 13pt; color: #000; margin: 0; padding: 0; position: relative; min-height: 250mm; }
                  .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e30a17; padding-bottom: 15px; }
                  .logo-text { color: #e30a17; font-size: 36px; font-weight: 900; margin: 0 0 5px 0; letter-spacing: 1px; }
                  .subtitle { font-size: 14pt; color: #000; font-weight: bold; margin: 0; }
                  .title { font-size: 16pt; font-weight: bold; text-align: center; margin: 40px 0; text-decoration: underline; }
                  .content { text-align: justify; margin-bottom: 50px; font-size: 14pt; line-height: 2; }
                  .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
                  .sig-box { text-align: center; width: 40%; }
                  .sig-title { font-weight: bold; margin-bottom: 10px; font-size: 12pt; }
                  .sig-name { margin-bottom: 40px; font-size: 12pt; }
                  .sig-line { border-bottom: 1px solid #000; width: 80%; margin: 0 auto; }
                  .footer { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 11pt; border-top: 1px solid #ccc; padding-top: 15px; color: #333; line-height: 1.5; }
                  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80pt; font-weight: bold; color: rgba(0, 0, 0, 0.03); z-index: -1; }
              </style>
          </head>
          <body>
              <div class="watermark">Sembol Nakliyat</div>
              <div class="header">
                  <h1 class="logo-text">SEMBOL NAKLİYAT</h1>
                  <h3 class="subtitle">EVDEN EVE - ASANSÖRLÜ TAŞIMA - DEPOLAMA</h3>
              </div>
              
              <div class="title">DEPOEVİM DEPO GİRİŞ TUTANAĞI</div>
              
              <div class="content">
                  <p>
                      SEMBOL NAKLİYAT firmasının deposunda bulunan <strong>${customer.name}</strong> isimli, <strong>${room.name}</strong> oda numaralı depoya benim adıma <strong>${proxyName}</strong> (TC: ${proxyTc}) isimli kişi benim nezaretim olmadan giriş yapabilir.
                  </p>
                  <p style="margin-top: 30px;">
                      Tarih: ${todayStr}
                  </p>
              </div>

              <div class="signatures">
                  <div class="sig-box">
                      <div class="sig-title">Müşteri İsim Soyisim</div>
                      <div class="sig-name">${customer.name}</div>
                      <div class="sig-title">İmza</div>
                      <div class="sig-line"></div>
                  </div>
                  <div class="sig-box">
                      <div class="sig-title">Vekil İsim Soyisim</div>
                      <div class="sig-name">${proxyName}</div>
                      <div class="sig-title">İmza</div>
                      <div class="sig-line"></div>
                  </div>
              </div>

              <div class="footer">
                  <strong>SEMBOL NAKLİYAT DEPOCULUK TİC.LTD.ŞTİ.</strong><br/>
                  Bahçelievler mah. Yeni sokak No 5 C Pendik / İstanbul<br/>
                  0(216) 390 89 99 / 0(554) 726 16 61<br/>
                  www.sembolevdeneve.com
              </div>
          </body>
          </html>
      `;

      setPdfFileName(customer?.name || 'Tutanak');
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(htmlContent);
      iframe.contentWindow.document.close();

      setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
          
          let proxyText = customer.proxyName ? customer.proxyName : 'belirttiğiniz kişi';
          const text = `Sayın ${customer.name},\n\n*${room.name}* numaralı odanız için "Vekalet ve Depo Giriş Tutanağı" oluşturulmuştur.\n\nSistemimize vekiliniz olarak ${proxyText} tanımlanmıştır. İlgili PDF belgesi sistemimiz üzerinden hazırlanmış olup tarafınıza iletilmek üzere kaydedilmiştir. Lütfen belgeyi inceleyip imzalayınız.\n\nİyi günler dileriz.`;
          const encodedText = encodeURIComponent(text);
          let waPhone = customer.phone.replace(/\D/g, '');
          if (waPhone.length === 10) waPhone = '90' + waPhone;
          else if (waPhone.length === 11 && waPhone.startsWith('0')) waPhone = '90' + waPhone.substring(1);
          
          window.open(`https://wa.me/${waPhone}?text=${encodedText}`, '_blank');
      }, 500);
  };

  const handleRoomEntryExitDocument = () => {
      setIsTutanakDropdownOpen(false);
      const room = selectedRoomDetail;
      const customer = customers.find(c => c.name === room?.customerName);
      
      if (!room || !customer) {
          alert("Oda veya müşteri bilgisi bulunamadı!");
          return;
      }

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const d = new Date();
      const todayStr = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      const currentTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

      const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <title>${sanitizePdfName(customer.name)}</title>
              <style>
                  @page { size: A4 portrait; margin: 20mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
                  body { font-family: 'Arial', sans-serif; line-height: 1.8; font-size: 13pt; color: #000; margin: 0; padding: 0; position: relative; min-height: 250mm; }
                  .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e30a17; padding-bottom: 15px; }
                  .logo-text { color: #e30a17; font-size: 36px; font-weight: 900; margin: 0 0 5px 0; letter-spacing: 1px; }
                  .subtitle { font-size: 14pt; color: #000; font-weight: bold; margin: 0; }
                  .title { font-size: 16pt; font-weight: bold; text-align: center; margin: 40px 0; text-decoration: underline; }
                  .content { text-align: justify; margin-bottom: 30px; font-size: 14pt; line-height: 2; }
                  .input-line { display: inline-block; border-bottom: 1px dotted #000; width: 100px; }
                  .warning-box { border: 2px solid #e30a17; padding: 15px; text-align: center; font-weight: bold; margin-top: 30px; margin-bottom: 40px; font-size: 12pt; color: #e30a17; }
                  .signatures { display: flex; justify-content: flex-end; margin-top: 60px; }
                  .sig-box { text-align: center; width: 40%; }
                  .sig-title { font-weight: bold; margin-bottom: 10px; font-size: 12pt; }
                  .sig-name { margin-bottom: 40px; font-size: 12pt; }
                  .sig-line { border-bottom: 1px solid #000; width: 80%; margin: 0 auto; }
                  .footer { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 11pt; border-top: 1px solid #ccc; padding-top: 15px; color: #333; line-height: 1.5; }
                  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80pt; font-weight: bold; color: rgba(0, 0, 0, 0.03); z-index: -1; }
              </style>
          </head>
          <body>
              <div class="watermark">Sembol Nakliyat</div>
              <div class="header">
                  <h1 class="logo-text">SEMBOL NAKLİYAT</h1>
                  <h3 class="subtitle">EVDEN EVE - ASANSÖRLÜ TAŞIMA - DEPOLAMA</h3>
              </div>
              
              <div class="title">DEPOEVİM DEPO GİRİŞ ÇIKIŞ TUTANAĞI</div>
              
              <div class="content">
                  <p>
                      SEMBOL NAKLİYAT firmasının deposunda bulunan <strong>${customer.name}</strong> isimli, <strong>${room.name}</strong> oda numaralı depoya giriş yapmış olup olabilecek tüm hasarların ve eksik eşyaların sorumluluğu şahsıma aittir.
                  </p>
                  
                  <div style="margin-top: 40px; display: flex; flex-direction: column; gap: 15px; font-weight: bold;">
                      <div>GİRİŞ TARİHİ : ${todayStr}</div>
                      <div>SAAT : ${currentTime}</div>
                      <div style="margin-top: 20px;">GİRİŞ <span class="input-line"></span> / ÇIKIŞ <span class="input-line"></span></div>
                  </div>
              </div>

              <div class="warning-box">
                  MÜHÜR DEĞİŞTİRME ÜCRETİ ${collectionRates.sealFee} TL + KDV FATURANIZA EKLENECEKTİR. (1 SAATLİK ÜCRETTİR.)
              </div>

              <div class="signatures">
                  <div class="sig-box">
                      <div class="sig-title">Müşteri İsim Soyisim</div>
                      <div class="sig-name">${customer.name}</div>
                      <div class="sig-title">İmza</div>
                      <div class="sig-line"></div>
                  </div>
              </div>

              <div class="footer">
                  <strong>SEMBOL NAKLİYAT DEPOCULUK TİC.LTD.ŞTİ.</strong><br/>
                  Bahçelievler mah. Yeni sokak No 5 C Pendik / İstanbul<br/>
                  0(216) 390 89 99 / 0(554) 726 16 61<br/>
                  www.sembolevdeneve.com
              </div>
          </body>
          </html>
      `;

      setPdfFileName(customer?.name || 'Tutanak');
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(htmlContent);
      iframe.contentWindow.document.close();

      setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
          
          const text = `Sayın ${customer.name},\n\n*${room.name}* numaralı odanız için "Depo Giriş Çıkış Tutanağı" oluşturulmuştur.\n\nİlgili PDF belgesi sistemimiz üzerinden hazırlanmış olup tarafınıza iletilmek üzere kaydedilmiştir. Lütfen belgeyi inceleyip imzalayınız.\n\nİyi günler dileriz.`;
          const encodedText = encodeURIComponent(text);
          let waPhone = customer.phone.replace(/\D/g, '');
          if (waPhone.length === 10) waPhone = '90' + waPhone;
          else if (waPhone.length === 11 && waPhone.startsWith('0')) waPhone = '90' + waPhone.substring(1);
          
          window.open(`https://wa.me/${waPhone}?text=${encodedText}`, '_blank');
      }, 500);
  };


  const handleOpenMessageModal = (customer, balance, type) => {
      setMessageModalData({ customer, balance, type });
  };

  const generateMessageText = (customer, balance, type) => {
      const iban = contractSettings.iban;
      const bank = contractSettings.bankFullName;
      const owner = contractSettings.accountHolder;
      const formattedBalance = balance.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
      
      let text = "";
      if (type === 'reminder') {
          text = `Merhaba ${customer.name},\n\nSistemimizde güncel cari hesabınıza ait toplam *${formattedBalance} TL* ödemeniz bulunmaktadır. Herhangi bir gecikme faizi işlememesi adına en kısa sürede ödemenizi gerçekleştirmenizi rica ederiz. İşlemlerinizin kesintisiz devam etmesi bizim için önemlidir.\n\n🏦 *Ödeme Bilgileri*\nBanka: ${bank}\nAlıcı: ${owner}\nIBAN: ${iban}\n\n⚠️ *ÖNEMLİ:* Ödemenizi gerçekleştirirken açıklama kısmına mutlaka *${customer.customerNo}* numaralı Müşteri Numaranızı yazmayı unutmayınız.\n\nİyi günler dileriz.`;
      } else if (type === 'warning') {
          text = `Sayın ${customer.name},\n\nSistem kayıtlarımıza göre ödenmemiş *${formattedBalance} TL* tutarında cari borcunuz bulunmaktadır. \n\nGecikme faizlerinin daha fazla artmaması ve hakkınızda yasal sürecin başlamaması adına en kısa sürede ödemenizi tamamlamanız gerekmektedir. Ödeme yapılmadığı takdirde sözleşmeden doğan haklarımız kullanılacaktır.\n\n🏦 *Hesap Bilgileri*\nBanka: ${bank}\nAlıcı: ${owner}\nIBAN: ${iban}\n\n⚠️ Lütfen ödeme açıklamasına *${customer.customerNo}* Müşteri Numaranızı ekleyiniz.\n\nBilgilerinize önemle sunarız.`;
      } else if (type === 'eviction') {
          text = `Sayın ${customer.name},\n\nBirikmiş olan *${formattedBalance} TL* borcunuz nedeniyle deponuzun *TAHLİYE* süreci başlatılma aşamasına gelmiştir.\n\nTahliye işlemi gerçekleştiği takdirde, oluşabilecek nakliye masrafları, eşya taşınırken doğabilecek hasar riskleri ve sürecin avukata intikaliyle eklenecek yasal takip masraflarından / faizlerden tamamen tarafınız sorumlu olacaktır. \n\nSüreci acilen durdurmak ve eşyalarınızın güvenliğini sağlamak için lütfen ödemenizi derhal gerçekleştiriniz.\n\n🏦 *Acil Ödeme Bilgileri*\nBanka: ${bank}\nAlıcı: ${owner}\nIBAN: ${iban}\n\n⚠️ Açıklama kısmına Müşteri Numaranızı (*${customer.customerNo}*) yazmanız zorunludur.`;
      }
      return text;
  };

  const handleSendMessage = (platform) => {
      if (!messageModalData) return;
      const { customer, balance, type } = messageModalData;
      const text = generateMessageText(customer, balance, type);
      const encodedText = encodeURIComponent(text);

      // YENİ EKLENEN: Telefon numarasını normalize et — boşluk/tire/parantez temizlenir,
      // baştaki 0 veya 90 kaldırılır, böylece WhatsApp doğru numaraya (90XXXXXXXXXX) yönlenir.
      let rawPhone = String(customer.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);

      if (platform === 'whatsapp') {
          window.open(`https://wa.me/90${rawPhone}?text=${encodedText}`, '_blank');
      } else if (platform === 'sms') {
          // iOS ve Android cihazlar için SMS ayırıcı farklılıkları
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          const separator = isIOS ? '&' : '?';
          window.open(`sms:+90${rawPhone}${separator}body=${encodedText}`, '_self');
      }
      setMessageModalData(null);
  };


  const [customers, setCustomers] = useState([]); // TEMİZLENDİ: Örnek/sahte müşteri kayıtları kaldırıldı, liste boş başlar.

const handleSaveCustomer = async () => {
      if (!newCustomer.name || !newCustomer.tc || !newCustomer.phone) return;
      logActivity('Müşteri Kayıt', `Yeni müşteri kaydedildi: ${newCustomer.name}`);

      // YENİ EKLENEN KONTROL: Aynı TC/VKN sistemde kayıtlı mı kontrolü
      const existingCust = customers.find(c => c.tc && c.tc.trim() === newCustomer.tc.trim());
      if (existingCust) {
          setCustomerSaveError(`Girdiğiniz TC/Vergi Numarası sistemde halihazırda "${existingCust.name}" adına kayıtlıdır. Lütfen bilgileri kontrol ediniz.`);
          setTimeout(() => setCustomerSaveError(''), 6000); // 6 saniye sonra uyarı gizlenir
          return; // Kaydetme işlemini iptal et
      }

      let newNo = '';
      let isUnique = false;
      while (!isUnique) {
          newNo = Math.floor(10000 + Math.random() * 90000).toString();
          if (!customers.some(c => c.customerNo === newNo)) isUnique = true;
      }

      const custId = 'cust_' + Date.now();
const cust = {
              id: custId,
              customerNo: newNo,
              name: newCustomer.name.toUpperCase(),
              tc: newCustomer.tc,
              phone: newCustomer.phone,
              altPhone: newCustomer.altPhone,
              // YENİ: Müşteri e-posta adresi (isteğe bağlı) — Paraşüt fatura gönderimi ve bilgilendirme için kullanılabilir
              email: String(newCustomer.email || '').trim().toLowerCase(),
              address: newCustomer.address,
              city: newCustomer.city,
              district: newCustomer.district,
              taxOffice: customerType === 'kurumsal' ? newCustomer.taxOffice : '',
              notes: newCustomer.notes,
              hasProxy: newCustomer.hasProxy,
              proxyName: newCustomer.hasProxy ? newCustomer.proxyName.toUpperCase() : '',
              proxyTc: newCustomer.hasProxy ? newCustomer.proxyTc : '',
              proxyPhone: newCustomer.hasProxy ? newCustomer.proxyPhone : '',
              proxyAltPhone: newCustomer.hasProxy ? newCustomer.proxyAltPhone : '',
              proxyAddress: newCustomer.hasProxy ? newCustomer.proxyAddress : '',
              proxyDocumentPhoto: newCustomer.hasProxy ? newCustomer.proxyDocumentPhoto : null,
              // YENİ EKLENEN: Birden fazla vekalet belgesi (ek belgeler dizisi) da kayda dahil edilir
              proxyDocumentPhotos: newCustomer.hasProxy ? (newCustomer.proxyDocumentPhotos || []) : [],
              type: customerType,
              createdAt: new Date().toLocaleDateString('tr-TR'),
              invoices: [],
              documentPhoto: newCustomer.documentPhotoFront || null,
              documentPhotoFront: newCustomer.documentPhotoFront || null,
              documentPhotoBack: newCustomer.documentPhotoBack || null,
              payments: [], extraDebts: [], ledgerOverrides: []
          };

      // YENİ: Yerel state'e ANINDA ekle — hem önizleme modunda çalışır hem de
      // hızlı eklemede müşteri, listede beklemeden seçilebilir olur.
      setCustomers(prev => [cust, ...prev.filter(c => c.id !== cust.id)]);

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', custId), cust);
          } catch (e) { console.error("Firebase Kayıt Hatası:", e); }
      }
      
      setCustomerSaveError('');
      setNewCustomer({ name: '', tc: '', phone: '', altPhone: '', email: '', address: '', city: 'İstanbul', district: '', taxOffice: '', notes: '', documentPhotoFront: null, documentPhotoBack: null, hasProxy: false, proxyName: '', proxyTc: '', proxyPhone: '', proxyAltPhone: '', proxyAddress: '', proxyDocumentPhoto: null });
      // YENİ: Hızlı ekleme modalından geldiyse sayfaya GİTME — modalı kapat ve
      // kiralama formunda yeni müşteriyi otomatik SEÇ (mevcut müşteri seçilmiş gibi).
      if (isQuickCustomerModalOpen) {
          setRentData(prev => ({ ...prev, customerName: cust.name }));
          setRentCustomerSearch('');
          setIsQuickCustomerModalOpen(false);
      } else {
          setActiveMenu('tum-musteriler');
      }
  };

// YENİ: Yeni Müşteri formu — hem 'Yeni Müşteri Ekle' sayfasında hem de kiralama
// ekranındaki HIZLI MÜŞTERİ EKLEME modalında birebir AYNI içerik olarak kullanılır.
const renderNewCustomerForm = () => (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6"><h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Müşteri Yönetimi</h1><h2 className="text-2xl font-bold text-slate-800">Yeni Müşteri Ekle</h2><p className="text-sm text-gray-500 mt-1">Sisteme yeni bir bireysel veya kurumsal müşteri tanımlayın.</p></div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
                {customerSaveError && (
                    <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
                        <div className="bg-red-100 p-1.5 rounded-full shrink-0"><AlertCircle size={18} className="text-red-600"/></div>
                        <span className="font-bold text-sm leading-relaxed">{customerSaveError}</span>
                    </div>
                )}
                <div className="flex gap-6 mb-8 pb-4 border-b border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer group"><input type="radio" name="customerType" value="bireysel" checked={customerType === 'bireysel'} onChange={() => setCustomerType('bireysel')} className="w-5 h-5 text-red-500 border-gray-300 focus:ring-red-500"/><span className={`text-sm font-bold transition-colors ${customerType === 'bireysel' ? 'text-slate-800' : 'text-gray-500'}`}>Bireysel Müşteri</span></label>
                  <label className="flex items-center gap-2 cursor-pointer group"><input type="radio" name="customerType" value="kurumsal" checked={customerType === 'kurumsal'} onChange={() => setCustomerType('kurumsal')} className="w-5 h-5 text-red-500 border-gray-300 focus:ring-red-500"/><span className={`text-sm font-bold transition-colors ${customerType === 'kurumsal' ? 'text-slate-800' : 'text-gray-500'}`}>Kurumsal Müşteri</span></label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-[#1bc5bd] uppercase tracking-wider">Müşteri Numarası (Sistem Ataması)</label>
                    <input type="text" readOnly value="Kayıt tamamlandığında otomatik olarak 5 haneli benzersiz numara atanacaktır." className="border-2 border-[#1bc5bd]/20 bg-teal-50/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none font-semibold text-teal-700 cursor-not-allowed" />
                  </div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{customerType === 'bireysel' ? 'Ad Soyad (Zorunlu)' : 'Firma Adı / Yetkili Kişi (Zorunlu)'}</label><input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})} placeholder={customerType === 'bireysel' ? 'Ad Soyad' : 'Firma Adı'} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{customerType === 'bireysel' ? 'TC Kimlik Numarası (Zorunlu)' : 'Vergi Numarası (Zorunlu)'}</label><input type="text" value={newCustomer.tc} onChange={(e) => setNewCustomer({...newCustomer, tc: e.target.value})} placeholder={customerType === 'bireysel' ? 'TC Kimlik No' : 'Vergi No'} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
                  {/* YENİ EKLENEN: Kurumsal müşteride Vergi Numarasının yanına Vergi Dairesi alanı */}
                  {customerType === 'kurumsal' && (
                      <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Vergi Dairesi (Zorunlu)</label><input type="text" value={newCustomer.taxOffice} onChange={(e) => setNewCustomer({...newCustomer, taxOffice: e.target.value})} placeholder="Örn: Pendik Vergi Dairesi" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
                  )}
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Telefon Numarası (Zorunlu)</label><input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Alternatif Telefon (İsteğe Bağlı)</label><input type="text" value={newCustomer.altPhone} onChange={(e) => setNewCustomer({...newCustomer, altPhone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
                  {/* YENİ EKLENEN: E-Posta Adresi (isteğe bağlı) — Bireysel ve Kurumsalda aynı. Fatura/bilgilendirme gönderimi için. */}
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">E-Posta Adresi (İsteğe Bağlı)</label><input type="email" value={newCustomer.email || ''} onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})} placeholder="Örn: musteri@ornek.com" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
                  {/* YENİ EKLENEN: İl (seçilebilir, 81 il, varsayılan İstanbul) ve İlçe (elle yazılabilir) — Bireysel ve Kurumsalda aynı */}
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">İl</label>
                      <select value={newCustomer.city} onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700 bg-white">
                          {turkiyeIlleri.map(il => <option key={il} value={il}>{il}</option>)}
                      </select>
                  </div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">İlçe</label><input type="text" value={newCustomer.district} onChange={(e) => setNewCustomer({...newCustomer, district: e.target.value})} placeholder="Örn: Pendik" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5 md:col-span-2"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Müşteri Adresi</label><input type="text" value={newCustomer.address} onChange={(e) => setNewCustomer({...newCustomer, address: e.target.value})} placeholder="Tam Adres" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700" /></div>
<div className="flex flex-col gap-1.5 md:col-span-2 mt-2">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{customerType === 'bireysel' ? 'Kimlik Fotoğrafı (İsteğe Bağlı)' : 'Kurumsal Belgeler (İsteğe Bağlı)'}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* ÖN YÜZ */}
                          <label className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer bg-slate-50 group h-full">
                            {newCustomer.documentPhotoFront ? (
                               <div className="flex flex-col items-center">
                                  <Check size={32} className="text-green-500 mb-2" />
                                  <span className="text-sm font-bold text-green-600">Ön Yüz Eklendi</span>
                                  <img src={newCustomer.documentPhotoFront} alt="Ön Yüz" className="mt-4 h-24 object-contain rounded border border-gray-200" />
                               </div>
                            ) : (
                               <>
                                 <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Upload size={20} className="text-red-400" /></div>
<p className="text-sm text-gray-600 mb-1 font-medium"><span className="text-red-500">{customerType === 'bireysel' ? 'Ön Yüz Seç' : 'Belge 1 Seç'}</span></p>    
           <p className="text-xs text-gray-400">PNG, JPG, PDF</p>
                               </>
                            )}
                            <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const file = e.target.files[0]; if(file) { const url = await uploadImageToServer(file); setNewCustomer({...newCustomer, documentPhotoFront: url}); } }} />
                          </label>

                          {/* ARKA YÜZ */}
                          <label className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer bg-slate-50 group h-full">
                            {newCustomer.documentPhotoBack ? (
                               <div className="flex flex-col items-center">
                                  <Check size={32} className="text-green-500 mb-2" />
                                  <span className="text-sm font-bold text-green-600">Arka Yüz Eklendi</span>
                                  <img src={newCustomer.documentPhotoBack} alt="Arka Yüz" className="mt-4 h-24 object-contain rounded border border-gray-200" />
                               </div>
                            ) : (
                               <>
                                 <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Upload size={20} className="text-red-400" /></div>
                                 <p className="text-sm text-gray-600 mb-1 font-medium"><span className="text-red-500">{customerType === 'bireysel' ? 'Arka Yüz' : 'Belge 2 (Opsiyonel)'} Seç</span></p>
                                 <p className="text-xs text-gray-400">PNG, JPG, PDF</p>
                               </>
                            )}
                            <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const file = e.target.files[0]; if(file) { const url = await uploadImageToServer(file); setNewCustomer({...newCustomer, documentPhotoBack: url}); } }} />
                          </label>
                      </div>
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Özel Notlar</label><textarea value={newCustomer.notes} onChange={(e) => setNewCustomer({...newCustomer, notes: e.target.value})} rows="3" placeholder="Müşteri hakkında eklemek istediğiniz notlar..." className="border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400 resize-none font-medium text-slate-700"></textarea></div>
                  
                  {/* YENİ EKLENEN: VEKALET BİLGİLERİ */}
                  <div className="md:col-span-2 mt-4 border-t border-gray-100 pt-6">
                      <label className="flex items-center gap-3 cursor-pointer w-max group">
                          <div className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${newCustomer.hasProxy ? 'bg-[#1bc5bd]' : 'bg-gray-300'}`} onClick={() => setNewCustomer({...newCustomer, hasProxy: !newCustomer.hasProxy})}>
                              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${newCustomer.hasProxy ? 'translate-x-6' : ''}`}></div>
                          </div>
                          <span className="font-bold text-gray-700 group-hover:text-[#1bc5bd] transition-colors">Vekalet Eden Bilgilerini Ekle (Opsiyonel)</span>
                      </label>
                  </div>
                  
                  {newCustomer.hasProxy && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 md:col-span-2 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 mt-2 animate-in fade-in slide-in-from-top-4">
                          <h4 className="md:col-span-2 font-bold text-indigo-800 border-b border-indigo-100 pb-3 flex items-center gap-2"><Shield size={18}/> Vekalet Eden Kişinin Bilgileri</h4>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Ad Soyad</label><input type="text" value={newCustomer.proxyName} onChange={(e) => setNewCustomer({...newCustomer, proxyName: e.target.value})} placeholder="Vekil Ad Soyad" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">TC Kimlik Numarası</label><input type="text" value={newCustomer.proxyTc} onChange={(e) => setNewCustomer({...newCustomer, proxyTc: e.target.value})} placeholder="Vekil TC Kimlik No" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Telefon Numarası</label><input type="text" value={newCustomer.proxyPhone} onChange={(e) => setNewCustomer({...newCustomer, proxyPhone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Yedek Telefon (İsteğe Bağlı)</label><input type="text" value={newCustomer.proxyAltPhone} onChange={(e) => setNewCustomer({...newCustomer, proxyAltPhone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5 md:col-span-2"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Adres</label><input type="text" value={newCustomer.proxyAddress} onChange={(e) => setNewCustomer({...newCustomer, proxyAddress: e.target.value})} placeholder="Tam Adres" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          
                          <div className="flex flex-col gap-1.5 md:col-span-2 mt-2">
                              <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Vekil Kimlik Fotoğrafı / Belgesi Yükle</label>
                              <label className="border-2 border-dashed border-indigo-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-indigo-50 hover:border-indigo-400 transition-colors cursor-pointer bg-white group">
                                {newCustomer.proxyDocumentPhoto ? (
                                   <div className="flex flex-col items-center">
                                      <Check size={32} className="text-indigo-500 mb-2" />
                                      <span className="text-sm font-bold text-indigo-600">Vekalet Belgesi Eklendi</span>
                                      <img src={newCustomer.proxyDocumentPhoto} alt="Belge" className="mt-4 h-24 object-contain rounded border border-gray-200" />
                                   </div>
                                ) : (
                                   <>
                                     <div className="w-12 h-12 bg-indigo-50 rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Upload size={20} className="text-indigo-500" /></div>
                                     <p className="text-sm text-gray-600 mb-1 font-medium"><span className="text-indigo-600">Dosya seçmek için tıklayın</span> veya sürükleyip bırakın</p>
                                     <p className="text-xs text-gray-400">PNG, JPG veya PDF formatında yükleyebilirsiniz</p>
                                   </>
                                )}
    <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const file = e.target.files[0]; if(file) { const url = await uploadImageToServer(file); setNewCustomer({...newCustomer, proxyDocumentPhoto: url}); } }} />                              </label>

                              {/* ═══════════════════════════════════════════════════════
                                  YENİ EKLENEN: BİRDEN FAZLA VEKALET BELGESİ (YENİ MÜŞTERİ)
                                  İlk belge mevcut tekli alanda kalır; ek belgeler yeni
                                  "proxyDocumentPhotos" dizisine eklenir (multiple seçim).
                                  ═══════════════════════════════════════════════════════ */}
                              <div className="mt-4 border-t border-indigo-100 pt-4">
                                  <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Ek Vekalet Belgeleri (Birden Fazla Eklenebilir)</label>
                                  {(newCustomer.proxyDocumentPhotos || []).length > 0 && (
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                          {(newCustomer.proxyDocumentPhotos || []).map((docUrl, idx) => (
                                              <div key={idx} className="relative border border-indigo-200 rounded-xl p-2 bg-white shadow-sm flex flex-col items-center gap-1.5">
                                                  <a href={docUrl} target="_blank" rel="noreferrer"><img src={docUrl} alt={`Ek Vekalet Belgesi ${idx + 1}`} className="h-20 object-contain rounded" /></a>
                                                  <span className="text-[10px] font-bold text-indigo-500">Ek Belge {idx + 1}</span>
                                                  <button type="button" onClick={(e) => { e.preventDefault(); setNewCustomer({ ...newCustomer, proxyDocumentPhotos: (newCustomer.proxyDocumentPhotos || []).filter((_, i) => i !== idx) }); }} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow" title="Bu belgeyi kaldır"><X size={14} /></button>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                                  <label className="mt-3 border-2 border-dashed border-indigo-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:bg-indigo-50 hover:border-indigo-400 transition-colors cursor-pointer bg-white group">
                                      <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm"><Plus size={16} /> Yeni Vekalet Belgesi Ekle</div>
                                      <p className="text-xs text-gray-400 mt-1">PNG, JPG veya PDF — aynı anda birden fazla dosya seçebilirsiniz</p>
                                      <input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const files = Array.from(e.target.files || []); if (files.length === 0) return; const urls = []; for (const f of files) { const u = await uploadImageToServer(f); if (u) urls.push(u); } setNewCustomer(prev => ({ ...prev, proxyDocumentPhotos: [...(prev.proxyDocumentPhotos || []), ...urls] })); e.target.value = ''; }} />
                                  </label>
                              </div>
                          </div>
                      </div>
                  )}

                </div>
                <div className="mt-8 flex justify-end gap-4 border-t border-gray-100 pt-6">
                  <button onClick={handleSaveCustomer} disabled={!newCustomer.name || !newCustomer.tc || !newCustomer.phone} className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold text-lg transition-colors shadow-lg shadow-red-500/30">Kişiyi Kaydet</button>
                </div>
              </div>
            </div>
          );


// YENİ: Müşterinin carisinde, verilen güne ait AKTİF (silinmemiş) bir tahsilat var mı?
// Silinen veya tarihi değiştirilen tahsilatlar artık o günü "dolu" saymaz — böylece
// tahsilat silindiğinde/düzenlendiğinde aynı güne yeniden tahsilat girilebilir.
const hasActivePaymentOnDate = (customer, dateStr, excludePaymentId = null) => {
    if (!customer || !dateStr) return false;
    const overrides = customer.ledgerOverrides || [];
    return (customer.payments || []).some(p => {
        // Düzenleme sırasında kaydın kendisi hariç tutulur
        if (excludePaymentId !== null && Number(p.id) === Number(excludePaymentId)) return false;
        const ov = overrides.find(o => o.txId === `credit-global-${p.id}`);
        // Cari dökümden "silindi" işaretlenen tahsilatlar sayılmaz
        if (ov && ov.isDeleted) return false;
        // Override ile tarihi değiştirilmişse GÜNCEL tarih baz alınır (eski günü boşaltır)
        let effDate = p.date;
        if (ov && ov.date) {
            const d = new Date(ov.date);
            if (!isNaN(d.getTime())) effDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        return effDate === dateStr;
    });
};

// YENİ: Aynı gün + AYNI TUTAR'lı aktif tahsilat var mı? (farklı tutar serbesttir;
// yalnızca birebir kopya girişinde onay akışı tetiklenir.) Onay bekleyen (soluk) kayıtlar sayılmaz.
const hasActiveSameAmountOnDate = (customer, dateStr, amount, excludePaymentId = null) => {
    if (!customer || !dateStr) return false;
    const overrides = customer.ledgerOverrides || [];
    const amt = Number(amount);
    return (customer.payments || []).some(p => {
        if (excludePaymentId !== null && Number(p.id) === Number(excludePaymentId)) return false;
        if (p.needsConfirm) return false; // henüz onaylanmamış (soluk) kayıtlar mükerrer saymaz
        const ov = overrides.find(o => o.txId === `credit-global-${p.id}`);
        if (ov && ov.isDeleted) return false;
        let effDate = p.date;
        if (ov && ov.date) {
            const d = new Date(ov.date);
            if (!isNaN(d.getTime())) effDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        return effDate === dateStr && Number(p.amount) === amt;
    });
};





  // YENİ EKLENEN: HATIRLATMALAR (muhasebe takvimi) — kaydet / tamamla-geri al / sil
  const handleSaveReminder = async () => {
      if (!reminderModal || !reminderModal.data) return;
      const d = reminderModal.data;
      if (!d.date || !(d.title || '').trim()) { alert('Lütfen tarih ve başlık girin.'); return; }
      const record = {
          id: d.id || `rem_${Date.now()}`,
          date: d.date,
          time: d.time || '',
          title: (d.title || '').trim(),
          note: (d.note || '').trim(),
          type: d.type || 'note',
          customerName: d.customerName || '',
          files: Array.isArray(d.files) ? d.files : [],
          completed: !!d.completed,
          createdBy: currentUserProfile?.name || '',
          createdAt: d.createdAt || Date.now()
      };
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reminders', String(record.id)), record, { merge: true }); } catch (e) { console.error('Hatırlatma Kaydetme Hatası:', e); }
      } else {
          setReminders(prev => { const ex = prev.some(r => String(r.id) === String(record.id)); return ex ? prev.map(r => String(r.id) === String(record.id) ? record : r) : [...prev, record]; });
      }
      // ═══════════════════════════════════════════════════════════════════
      // YENİ EKLENEN: HATIRLATMA → AYLIK BORÇ TAKİP SENKRONU
      // Müşteri seçili bir hatırlatma kaydedildiğinde, aynı bilgi müşterinin
      // "Tahsilat Notları"na da yazılır → Aylık Borç Takip kartında görünür.
      // Ödeme Sözü türündeyse notun "Söz" tarihi hatırlatmanın tarihi olur.
      // linkedReminderId ile eşleştirilir: düzenlemede çift kayıt oluşmaz,
      // mevcut senkron not güncellenir. (Not→Hatırlatma yönü zaten vardı;
      // bu blok ile senkron artık ÇİFT YÖNLÜ.)
      // ═══════════════════════════════════════════════════════════════════
      try {
          const _linkedCust = record.customerName ? customers.find(c => c.name === record.customerName) : null;
          if (_linkedCust) {
              const _existing = _linkedCust.collectionNotes || [];
              // Bu hatırlatmaya bağlı not var mı? (rem_promise_* id'li kayıtlarda kaynak notu da yakala)
              const _srcNoteId = String(record.id).startsWith('rem_promise_') ? String(record.id).slice('rem_promise_'.length) : null;
              const _idx = _existing.findIndex(n => n && (String(n.linkedReminderId || '') === String(record.id) || (_srcNoteId && String(n.id) === _srcNoteId)));
              const _noteText = (record.note || '').trim() || record.title;
              const _syncNote = {
                  id: _idx >= 0 ? _existing[_idx].id : Date.now(),
                  date: _idx >= 0 ? _existing[_idx].date : new Date().toLocaleDateString('tr-TR'),
                  text: _noteText,
                  promiseDate: record.type === 'promise' ? record.date : (_idx >= 0 ? (_existing[_idx].promiseDate || '') : ''),
                  linkedReminderId: record.id
              };
              const _updated = _idx >= 0 ? _existing.map((n, i) => (i === _idx ? _syncNote : n)) : [_syncNote, ..._existing];
              if (db && firebaseUser) {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(_linkedCust.id)), { collectionNotes: _updated }, { merge: true });
              } else {
                  setCustomers(prev => prev.map(c => c.id === _linkedCust.id ? { ...c, collectionNotes: _updated } : c));
              }
          }
      } catch (e) { console.error('Hatırlatma → Tahsilat Notu senkron hatası:', e); }

      logActivity(reminderModal.mode === 'edit' ? 'Hatırlatma Düzenleme' : 'Hatırlatma Ekleme', `${record.title} (${record.date})`);
      setReminderModal(null);
  };
  const handleToggleReminder = async (rem) => {
      const nextCompleted = !rem.completed;
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reminders', String(rem.id)), { completed: nextCompleted }, { merge: true }); } catch (e) { console.error('Hatırlatma Güncelleme Hatası:', e); }
      } else {
          setReminders(prev => prev.map(r => String(r.id) === String(rem.id) ? { ...r, completed: nextCompleted } : r));
      }
  };
  const handleDeleteReminder = async (remId) => {
      if (!window.confirm('Bu hatırlatmayı silmek istediğinize emin misiniz?')) return;
      if (db && firebaseUser) {
          try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reminders', String(remId))); } catch (e) { console.error('Hatırlatma Silme Hatası:', e); }
      } else {
          setReminders(prev => prev.filter(r => String(r.id) !== String(remId)));
      }
  };

  // YENİ: İlk açılış splash'ı için güvenlik yedeği — veriler gelmese/db olmasa bile bir süre sonra kapanır.
  useEffect(() => {
      const _to = setTimeout(() => setAppDataReady(true), db ? 8000 : 1200);
      return () => clearTimeout(_to);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
      try { if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') { Notification.requestPermission().catch(() => {}); } } catch (e) { /* yoksay */ }
  }, []);
  // YENİ: Günü/saati gelmiş, tamamlanmamış hatırlatmalar için masaüstü bildirimi (dakikada bir kontrol; her kayıt için bir kez).
  const notifiedReminderIdsRef = useRef({});
  useEffect(() => {
      const check = () => {
          try {
              if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
              const now = new Date();
              const todayStr = now.toISOString().split('T')[0];
              (reminders || []).forEach(r => {
                  if (!r || r.completed || !r.date) return;
                  if (notifiedReminderIdsRef.current[r.id]) return;
                  let due = false;
                  if (r.date < todayStr) due = true; // geçmiş günden kalan
                  else if (r.date === todayStr) {
                      if (!r.time) due = true;
                      else { const parts = String(r.time).split(':'); const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(parts[0]) || 0, Number(parts[1]) || 0); if (now >= t) due = true; }
                  }
                  if (due) {
                      notifiedReminderIdsRef.current[r.id] = true;
                      try { new Notification('Hatırlatma: ' + (r.title || ''), { body: (r.customerName ? r.customerName + ' • ' : '') + (r.note || r.title || ''), tag: String(r.id) }); } catch (e) { /* yoksay */ }
                  }
              });
          } catch (e) { /* yoksay */ }
      };
      check();
      const _id = setInterval(check, 60000);
      return () => clearInterval(_id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders]);


  // ═══════════════════════════════════════════════════════════════════════
  // YENİ EKLENEN: ÖDEME SÖZÜ GÜNCELLEME
  // Hatırlatma kartındaki "Güncelle" butonu ile çalışır:
  //   • Girilen not, TARİHİ ve girenin adıyla birlikte kayda eklenir (geçmiş korunur).
  //   • Hatırlatmanın takvimdeki işareti BUGÜNE taşınır (müşteriyle bugün konuşuldu).
  //   • Kaydın tamamlanmadı durumu korunur; takip devam eder.
  // ═══════════════════════════════════════════════════════════════════════
  const [isPromiseUpdateOpen, setIsPromiseUpdateOpen] = useState(false);
  const [promiseUpdateTarget, setPromiseUpdateTarget] = useState(null);
  const [promiseUpdateText, setPromiseUpdateText] = useState('');
  const [promiseUpdateDate, setPromiseUpdateDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSavePromiseUpdate = async () => {
      if (!promiseUpdateTarget || !promiseUpdateText.trim()) return;
      const _r = promiseUpdateTarget;
      const _newDate = promiseUpdateDate || new Date().toISOString().split('T')[0];
      const _entry = {
          id: `pu_${Date.now()}`,
          text: promiseUpdateText.trim(),
          at: Date.now(),
          by: currentUserProfile?.name || 'Sistem',
          movedFrom: (_r.date && _r.date !== _newDate)
              ? new Date(_r.date).toLocaleDateString('tr-TR')   // taşınmadan önceki tarih
              : ''
      };
      const _updates = [...(_r.promiseUpdates || []), _entry];
      const _payload = { date: _newDate, promiseUpdates: _updates, completed: false };

      // Yerel state ANINDA güncellenir (önizlemede de çalışır)
      setReminders(prev => prev.map(x => String(x.id) === String(_r.id) ? { ...x, ..._payload } : x));

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reminders', String(_r.id)), _payload, { merge: true });
          } catch (e) { console.error('Ödeme sözü güncelleme hatası:', e); }
      }
      logActivity('Ödeme Sözü', `${_r.customerName || ''} ödeme sözü güncellendi ve ${new Date(_newDate).toLocaleDateString('tr-TR')} tarihine taşındı.`);

      setIsPromiseUpdateOpen(false);
      setPromiseUpdateTarget(null);
      setPromiseUpdateText('');
  };

  // ═══════════════════════════════════════════════════════════════════════
  // YENİ: TOPLU m³ KÜSURAT DÜZELTME
  // Tüm depolardaki odaları tarar; m³ değeri küsuratlı olanları yuvarlama
  // kuralına göre TAM SAYIYA çevirir (0,20 ve altı aşağı / 0,21 ve üstü yukarı)
  // ve veritabanına yazar. Zaten tam sayı olan odalara DOKUNULMAZ.
  // Yalnızca m³ alanı değişir; ölçüler, müşteri ve kira bilgileri korunur.
  // ═══════════════════════════════════════════════════════════════════════
  const [bulkM3Fixing, setBulkM3Fixing] = useState(false);
  const [bulkM3Result, setBulkM3Result] = useState('');

  const handleBulkFixRoomM3 = async () => {
      // Düzeltilecek odaları önce tespit et (küsuratı olanlar)
      const targets = (rooms || []).filter(r => {
          const n = Number(r?.m3);
          if (isNaN(n) || n <= 0) return false;
          return roundRoomM3(n) !== n;   // yuvarlanmış değer farklıysa küsurat var
      });

      if (targets.length === 0) {
          setBulkM3Result('✓ Küsuratlı oda bulunamadı — tüm odalar zaten tam sayı.');
          setTimeout(() => setBulkM3Result(''), 6000);
          return;
      }

      if (!window.confirm(`${targets.length} odanın m³ değerinde küsurat var.\n\nHepsi tam sayıya yuvarlanacak (0,20 ve altı aşağı, 0,21 ve üstü yukarı).\nÖlçüler, müşteri ve kira bilgileri DEĞİŞMEZ.\n\nDevam edilsin mi?`)) return;

      setBulkM3Fixing(true);
      let done = 0, failed = 0;
      for (const r of targets) {
          const newM3 = roundRoomM3(r.m3);
          try {
              if (db && firebaseUser) {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(r.id)), { m3: newM3 }, { merge: true });
              }
              done++;
          } catch (e) {
              failed++;
              console.error(`Oda m³ düzeltme hatası (${r.name}):`, e);
          }
          setBulkM3Result(`Düzeltiliyor ${done + failed}/${targets.length}...`);
      }

      // Yerel listeyi de güncelle (anında görünürlük)
      const _map = new Map(targets.map(t => [String(t.id), roundRoomM3(t.m3)]));
      setRooms(prev => prev.map(r => _map.has(String(r.id)) ? { ...r, m3: _map.get(String(r.id)) } : r));

      logActivity('Toplu Düzeltme', `${done} odanın m³ küsuratı tam sayıya yuvarlandı.`);
      setBulkM3Result(failed === 0
          ? `✓ ${done} odanın m³ değeri tam sayıya yuvarlandı.`
          : `${done} oda düzeltildi, ${failed} oda düzeltilemedi. İnternet bağlantısını kontrol edin.`);
      setBulkM3Fixing(false);
      setTimeout(() => setBulkM3Result(''), 10000);
  };

const handleSaveContractSettings = async () => {
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'contract'), contractSettings);
              alert("Ayarlar başarıyla Firebase'e kaydedildi!");
          } catch(e) { console.error("Ayar Kayıt Hatası:", e); }
      }
  };



  // YENİ EKLENEN: Herhangi bir müşterinin carisine sözleşme/tutanak belgesi kaydeder (önizleme + canlı).
  // record: { id, label, date, file, note }
  const saveContractToCustomer = async (customerId, record) => {
      if (db && firebaseUser) {
          try {
              // DÜZELTME: arrayUnion ile ATOMİK ekleme — yerel liste eski olsa bile sunucudaki
              // diziyi EZMEDEN ekler; böylece ardışık/eşzamanlı eklemede hiçbir sözleşme/sayfa kaybolmaz.
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerId)), { contracts: arrayUnion(record) }, { merge: true });
          } catch (e) { console.error("Sözleşme Kaydetme Hatası:", e); }
      } else {
          setCustomers(prev => prev.map(c => String(c.id) === String(customerId) ? { ...c, contracts: [...(c.contracts || []), record] } : c));
      }
  };


  // Bir dosya seçilip belirtilen müşterinin carisine sözleşme/tutanak olarak yüklenmesi (modallardaki "Cariye Yükle")
  const uploadSignedDocToCustomer = async (customerId, file, label) => {
      if (!file || !customerId) return;
      try {
          const url = await uploadImageToServer(file);
          const record = { id: Date.now(), label: label || 'İmzalı Belge', date: new Date().toISOString().split('T')[0], file: url, note: '' };
          await saveContractToCustomer(customerId, record);
          alert(`Belge "${label}" olarak müşterinin cari Sözleşmeler bölümüne kaydedildi.`);
      } catch (e) { console.error("İmzalı Belge Yükleme Hatası:", e); }
  };

  // YENİ EKLENEN: Oda detayındaki "Sözleşme Yükle" — birden fazla dosya yüklenebilir.
  // Kayıt ekranındaki sözleşme çalışma mantığıyla AYNI: her dosya uploadImageToServer ile yüklenip
  // müşterinin cari "contracts" dizisine kaydedilir. Kayıtlar odayla ilişkilendirilir (roomId/roomName).
  const handleUploadRoomContracts = async (fileList) => {
      const files = Array.from(fileList || []);
      if (files.length === 0 || !selectedRoomDetail) return;
      const cust = customers.find(c => c.name === selectedRoomDetail.customerName);
      if (!cust) { alert('Bu odaya bağlı bir müşteri bulunamadı.'); return; }
      try {
          // Tüm dosyaları sırayla yükle ve kayıtları hazırla; tek seferde kaydet (kayıp olmasın).
          const newRecords = [];
          for (const f of files) {
              const url = await uploadImageToServer(f);
              newRecords.push({ id: Date.now() + Math.floor(Math.random() * 100000), label: `${selectedRoomDetail.name} Oda Sözleşmesi`, date: new Date().toISOString().split('T')[0], file: url, note: '', roomId: selectedRoomDetail.id, roomName: selectedRoomDetail.name });
          }
          if (db && firebaseUser) {
              // DÜZELTME: arrayUnion ile atomik ekleme — önceki sözleşmeler/sayfalar ezilmez, kaybolmaz.
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(cust.id)), { contracts: arrayUnion(...newRecords) }, { merge: true });
          } else {
              setCustomers(prev => prev.map(c => String(c.id) === String(cust.id) ? { ...c, contracts: [...(c.contracts || []), ...newRecords] } : c));
          }
          logActivity('Oda Sözleşmesi Yükleme', `${cust.name} - ${selectedRoomDetail.name} odasına ${newRecords.length} sözleşme dosyası yüklendi.`);
      } catch (e) { console.error("Oda Sözleşmesi Yükleme Hatası:", e); }
  };

  // Depo/Şube/Blok/Oda CRUD state'leri, modalları ve işlemleri (ekleme/düzenleme/silme,
  // sıralama, kolon hacmi hesabı vb.) → src/depo.jsx bileşenine taşındı. Burada yalnızca
  // Müşteri/Ödeme/Finans ekranlarınca da paylaşılan veri ve yardımcı fonksiyonlar kalır.
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);

  const [blocks, setBlocks] = useState([
      { id: 201, warehouseId: 2, name: 'A BLOK', m3: 0, orderIndex: 0 }
  ]); // TEMİZLENDİ: 101 (A BLOK) ve 102 (B BLOK) örnek blokları kaldırıldı.

  const [selectedBlockId, setSelectedBlockId] = useState(null);

  const [rooms, setRooms] = useState([]); // TEMİZLENDİ: Örnek/boş oda (K-501) kaldırıldı — oda verileri yalnızca Firebase'den çekilir.

  const [warehouses, setWarehouses] = useState([]); // TEMİZLENDİ: Örnek/sahte şube (depo) kayıtları kaldırıldı, liste boş başlar.

  // ODA m³ KÜSURAT YUVARLAMA KURALI — küsurat 0,20 ve ALTI ise AŞAĞI, 0,21 ve ÜSTÜ ise
  // YUKARI yuvarlanır. Örn: 22,11 → 22 | 11,82 → 12 | 19,23 → 20 | 13,06 → 13
  const roundRoomM3 = (v) => {
      const n = Number(v);
      if (isNaN(n) || n <= 0) return 0;
      const rounded = Math.round(n * 100) / 100;   // kayan nokta hatasını temizle
      const base = Math.floor(rounded);
      const frac = Math.round((rounded - base) * 100) / 100;
      return frac <= 0.20 ? base : base + 1;
  };

  // Kart/detay ekranlarında oda hacmini gösterir.
  // Ölçüsü girilmiş odalarda TAM SAYI (yuvarlama kuralı), diğerlerinde mevcut değer gösterilir.
  const displayRoomM3 = (room) => {
      if (!room) return '0';
      const hasDims = [room.width, room.length, room.height].every(v => Number(v) > 0);
      return hasDims ? String(roundRoomM3(room.m3)) : formatM3(room.m3);
  };

  // YENİ: m³ değerini Türkçe ondalık biçiminde gösterir (22.11 → 22,11). Tam sayıysa ondalık yazılmaz.
  const formatM3 = (v) => {
      const n = Number(v);
      if (isNaN(n)) return '0';
      return (Math.round(n * 100) / 100).toString().replace('.', ',');
  };

  // YENİ: Oda ölçülerini "3×2×2,5 m" biçiminde kısa metne çevirir (kart ve oda içi gösterim).
  const formatRoomDims = (room) => {
      if (!room) return '';
      const f = (v) => {
          const n = Number(v);
          if (isNaN(n) || n <= 0) return null;
          return String(n).replace('.', ',');   // Türkçe ondalık gösterim
      };
      const w = f(room.width), l = f(room.length), h = f(room.height);
      if (!w || !l || !h) return '';
      return `${w}×${l}×${h} m`;
  };

  // --- ODA DETAY MODALLARI ---
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  // YENİ: Sayfa YENİLENDİĞİNDE mevcut sayfada kalınsın + YENİ SEKMEDE açma desteği (URL hash ile).
  // NOT: activeMenu/selectedCustomerId/selectedRoomId TANIMLANDIKTAN SONRA yer almalı (aksi halde TDZ hatası).
  const skipFirstHashWriteRef = useRef(true);
  // 1) Açılışta URL hash'ini oku ve ilgili sayfaya/seçime dön (yenileme veya yeni sekme).
  useEffect(() => {
      try {
          const h = (window.location.hash || '').replace(/^#/, '');
          if (!h) return;
          const params = new URLSearchParams(h);
          const m = params.get('m');
          const c = params.get('c');
          const r = params.get('r');
          if (m) setActiveMenu(m);
          if (c) setSelectedCustomerId(c);   // CANLI'da müşteri id = Firestore doc.id (string) → strict eşleşir
          if (r) setSelectedRoomId(r);
      } catch (e) { /* URL erişilemezse yoksay */ }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 2) Aktif sayfa/seçim değiştikçe URL hash'ini güncelle (böylece yenilemede aynı sayfa açılır).
  useEffect(() => {
      if (skipFirstHashWriteRef.current) { skipFirstHashWriteRef.current = false; return; }
      try {
          const params = new URLSearchParams();
          if (activeMenu) params.set('m', activeMenu);
          if (selectedCustomerId) params.set('c', String(selectedCustomerId));
          if (selectedRoomId) params.set('r', String(selectedRoomId));
          const newHash = params.toString();
          window.history.replaceState(null, '', window.location.pathname + window.location.search + (newHash ? '#' + newHash : ''));
      } catch (e) { /* yoksay */ }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, selectedCustomerId, selectedRoomId]);

  // YENİ: <a href> linklerinde SOL tık uygulama içi gezinir; Ctrl/Cmd/orta tık ise tarayıcının
  // "yeni sekmede aç" varsayılanına bırakılır. Böylece sağ tıkta "Yeni sekmede aç" seçeneği çıkar.
  const handleNavClick = (e, navFn) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // tarayıcı yeni sekmede açsın
      e.preventDefault();
      navFn();
  };

  // YENİ: Müşteri listesindeki KAYDIRMA konumunu koru — bir cariye girip "Listeye Geri Dön" ile
  // dönünce liste en başa dönmesin, kaldığı yerden devam etsin.
  const mainScrollRef = useRef(null);
  const listScrollTopRef = useRef(0);
  const prevSelectedCustRef = useRef(null);
  const handleMainScroll = () => {
      // Cari profili KAPALIYKEN (liste görünürken) son kaydırma konumunu sakla.
      if (!selectedCustomerId && mainScrollRef.current) {
          listScrollTopRef.current = mainScrollRef.current.scrollTop;
      }
  };
  React.useLayoutEffect(() => {
      const prev = prevSelectedCustRef.current;
      // Profilden (dolu) listeye (null) dönüldüğünde saklanan kaydırma konumunu geri yükle.
      if (prev && !selectedCustomerId && mainScrollRef.current) {
          mainScrollRef.current.scrollTop = listScrollTopRef.current;
      }
      prevSelectedCustRef.current = selectedCustomerId;
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId]);
  const [detailYear, setDetailYear] = useState(2026);

  // Diğer ekranlardan (Ödeme/Finans) da "Odaya Git" ile bu görünümlere gidilebildiği için
  // seçim/kapsam state'leri burada kalır; sizeFilterModal/roomInScope/sizeFilters (yalnızca
  // depo ekranına özel) → src/depo.jsx içine taşındı.
  const [activeSizeFilter, setActiveSizeFilter] = useState(null);
  const [sizeFilterScope, setSizeFilterScope] = useState(null);
  // YENİ: "Rezerve Göster" görünümü ve kapsamı (aynı kapsam mantığı)
  const [showReservedView, setShowReservedView] = useState(false);
  const [reservedViewScope, setReservedViewScope] = useState(null);

  const [isEndRentModalOpen, setIsEndRentModalOpen] = useState(false);
  const [endRentData, setEndRentData] = useState({ exitDate: new Date().toISOString().split('T')[0], photo: null, carrierName: '', carrierVkn: '', carrierAuthorized: '', exitBy: '' });
  // YENİ: Çıkış modalındaki "Tutanak" ve "Depo Fotoğrafı" yükleme açılır menülerini yönetir. ('tutanak' | 'depo' | null)
  const [endRentDocsMenu, setEndRentDocsMenu] = useState(null);
  // YENİ: Çıkış SONRASI belge (tutanak + depo fotoğrafı) ekleme modalı.
  // 'action-depodan-cikis' yetkisi olan personel, tamamlanmış bir çıkış kaydını seçip
  // sonradan tutanak / depo fotoğrafı ekleyebilsin diye kullanılır.
  const [isExitDocsModalOpen, setIsExitDocsModalOpen] = useState(false);
  const [exitDocsUploadMenu, setExitDocsUploadMenu] = useState(null); // 'tutanak' | 'depo' | null
  // Seçili geçmiş kaydı: { index, historyId, customerName, roomName, tutanak, depoPhoto }
  const [exitDocsTarget, setExitDocsTarget] = useState(null);
  // YENİ: Cari borcu olan müşteride oda çıkışı engellenince gösterilecek uyarı ekranı.
  // null → kapalı | { customerId, customerName, roomName, balance } → açık
  const [exitDebtBlock, setExitDebtBlock] = useState(null);
  // YENİ EKLENEN: Çıkış modalında "Yükle" açılır menüsü
  const [endRentUploadMenu, setEndRentUploadMenu] = useState(false);
  // --- İCRA SÜRECİ STATE'LERİ ---
  const [isLegalActionModalOpen, setIsLegalActionModalOpen] = useState(false);
  const [legalActionData, setLegalActionData] = useState({ reason: '', type: 'start' }); // 'start' veya 'stop'

  // ============ YENİ: İCRA DOSYASI — YASAL SÜREÇ TAKİP + DOSYA/FOTO/VİDEO ============
  // Her icra odası için: durum hareketleri (iletişim/ihtar/icra/ödeme...) ve ekli belgeler.
  const [legalFileModalRoomId, setLegalFileModalRoomId] = useState(null); // açık modalın oda id'si
  const LEGAL_PROC_STATUSES = ['Müşteriyle İletişime Geçildi', 'Müşteriye Ulaşılamadı', 'İhtar Çekildi', 'İcra Başlatıldı', 'Haciz İşlemi', 'Ödeme Sözü Alındı', 'Ödeme Alındı', 'Kısmi Ödeme Yapıldı', 'Dosya Kapandı', 'Diğer'];
  const emptyLegalProcForm = () => ({ id: null, date: new Date().toISOString().split('T')[0], status: 'Müşteriyle İletişime Geçildi', amount: '', note: '' });
  const [legalProcForm, setLegalProcForm] = useState(emptyLegalProcForm());
  const [legalFilesUploading, setLegalFilesUploading] = useState(false);

  // Odanın yasal alanlarını (süreç/dosyalar) kaydet — canlıda Firestore'a, önizlemede yerel state'e.
  const saveRoomLegalData = async (roomId, patch) => {
      setRooms(prev => prev.map(r => String(r.id) === String(roomId) ? { ...r, ...patch } : r));
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(roomId)), patch, { merge: true }); } catch (e) { console.error('İcra dosyası kaydetme hatası:', e); }
      }
  };

  // Süreç hareketi ekle/güncelle
  const handleSaveLegalProcEntry = async (roomId) => {
      if (!legalProcForm.status) return;
      const room = rooms.find(r => String(r.id) === String(roomId));
      if (!room) return;
      const list = Array.isArray(room.legalProcess) ? [...room.legalProcess] : [];
      if (legalProcForm.id) {
          const idx = list.findIndex(e => String(e.id) === String(legalProcForm.id));
          if (idx >= 0) list[idx] = { ...list[idx], date: legalProcForm.date, status: legalProcForm.status, amount: legalProcForm.amount !== '' ? Number(legalProcForm.amount) : null, note: legalProcForm.note || '', updatedBy: currentUserProfile?.name || '', updatedAt: Date.now() };
      } else {
          list.push({ id: `lp_${Date.now()}_${Math.floor(Math.random() * 1000)}`, date: legalProcForm.date, status: legalProcForm.status, amount: legalProcForm.amount !== '' ? Number(legalProcForm.amount) : null, note: legalProcForm.note || '', createdBy: currentUserProfile?.name || '', createdAt: Date.now() });
      }
      await saveRoomLegalData(roomId, { legalProcess: list });
      setLegalProcForm(emptyLegalProcForm());
  };

  const handleDeleteLegalProcEntry = async (roomId, entryId) => {
      if (!window.confirm('Bu süreç hareketini silmek istediğinize emin misiniz?')) return;
      const room = rooms.find(r => String(r.id) === String(roomId));
      if (!room) return;
      const list = (room.legalProcess || []).filter(e => String(e.id) !== String(entryId));
      await saveRoomLegalData(roomId, { legalProcess: list });
      if (legalProcForm.id && String(legalProcForm.id) === String(entryId)) setLegalProcForm(emptyLegalProcForm());
  };

  // Dosya/foto/video ekle (birden fazla) ve kaldır
  const handleAddLegalFiles = async (roomId, fileList) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;
      const room = rooms.find(r => String(r.id) === String(roomId));
      if (!room) return;
      setLegalFilesUploading(true);
      const added = [];
      for (const f of files) {
          try {
              const url = await uploadImageToServer(f);
              const kind = String(f.type || '').startsWith('video') ? 'video' : (String(f.type || '') === 'application/pdf' ? 'pdf' : 'image');
              added.push({ id: `lf_${Date.now()}_${Math.floor(Math.random() * 10000)}`, name: f.name, url, kind, addedBy: currentUserProfile?.name || '', addedAt: Date.now() });
          } catch (e) { console.error('İcra dosyası yükleme hatası:', e); }
      }
      setLegalFilesUploading(false);
      if (added.length === 0) { alert('Dosya(lar) yüklenemedi, lütfen tekrar deneyin.'); return; }
      await saveRoomLegalData(roomId, { legalFiles: [...(room.legalFiles || []), ...added] });
  };

  const handleRemoveLegalFile = async (roomId, fileId) => {
      if (!window.confirm('Bu belgeyi kaldırmak istediğinize emin misiniz?')) return;
      const room = rooms.find(r => String(r.id) === String(roomId));
      if (!room) return;
      await saveRoomLegalData(roomId, { legalFiles: (room.legalFiles || []).filter(f => String(f.id) !== String(fileId)) });
  };
  // ============ /İCRA DOSYASI ============

  const handleLegalActionConfirm = async () => {
      if (legalActionData.type === 'start' && !legalActionData.reason) return;
      
      const roomToUpdate = rooms.find(r => r.id === selectedRoomId);
      if (!roomToUpdate || !db || !firebaseUser) return;

      const d = new Date();
      const dateStr = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
      
      const newHistoryItem = {
          id: Date.now(),
          date: dateStr,
          type: legalActionData.type,
          reason: legalActionData.type === 'start' ? legalActionData.reason : 'İcra süreci kaldırıldı ve kiralama normale döndürüldü.'
      };

      const existingHistory = roomToUpdate.legalActionHistory || [];

      try {
          if (legalActionData.type === 'start') {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), {
                  isUnderLegalAction: true,
                  legalActionReason: legalActionData.reason,
                  legalActionStartDate: Date.now(),
                  legalActionHistory: [newHistoryItem, ...existingHistory]
              }, { merge: true });
          } else {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), {
                  isUnderLegalAction: false,
                  legalActionReason: null,
                  legalActionStartDate: null,
                  legalActionHistory: [newHistoryItem, ...existingHistory]
              }, { merge: true });
          }
      } catch (e) {
          console.error("İcra İşlemi Hatası:", e);
      }

      setIsLegalActionModalOpen(false);
      setLegalActionData({ reason: '', type: 'start' });
  };
  const [isApplyIncreaseModalOpen, setIsApplyIncreaseModalOpen] = useState(false);
  const [increaseModalData, setIncreaseModalData] = useState(null);
  const [increaseMode, setIncreaseMode] = useState('percentage');
  const [increasePercentage, setIncreasePercentage] = useState('');
  const [newRentAmount, setNewRentAmount] = useState('');
  
const [isPastIncreaseModalOpen, setIsPastIncreaseModalOpen] = useState(false);
  const [pastIncreaseData, setPastIncreaseData] = useState({ date: new Date().toISOString().split('T')[0], amount: '', isKdvIncluded: true });

  const [isEditSpecificMonthModalOpen, setIsEditSpecificMonthModalOpen] = useState(false);
  const [specificMonthEditData, setSpecificMonthEditData] = useState(null);

  const [isChangeRoomModalOpen, setIsChangeRoomModalOpen] = useState(false);
  const [changeRoomWarehouseId, setChangeRoomWarehouseId] = useState('');
  const [changeRoomBlockId, setChangeRoomBlockId] = useState('');
  const [changeRoomTargetRoomId, setChangeRoomTargetRoomId] = useState('');
  // YENİ: Oda Değiştir — kira aynı kalsın mı yoksa yeni kira mı belirlenecek
  const [changeRoomFeeMode, setChangeRoomFeeMode] = useState('same'); // 'same' | 'new'
  const [changeRoomNewFee, setChangeRoomNewFee] = useState(''); // KDV DAHİL tutar olarak girilir
  const [isPriceHistoryModalOpen, setIsPriceHistoryModalOpen] = useState(false);
  const [isRoomHistoryModalOpen, setIsRoomHistoryModalOpen] = useState(false);
  const [isEditRentModalOpen, setIsEditRentModalOpen] = useState(false);
  const [editRentData, setEditRentData] = useState({ customerName: '', entryDate: '', paymentDate: '', monthlyFee: '', hasKdv: true, sealNo: '', broughtBy: 'kendisi', teamList: '' });

  const [isTutanakDropdownOpen, setIsTutanakDropdownOpen] = useState(false);
  // YENİ EKLENEN: "Bilgilendirme Gönder" — hangi bilgilendirme açık (type) + yazdır/paylaş/yükle
  const [infoNotifyModal, setInfoNotifyModal] = useState(null); // 'self' | 'exit' | 'entry'

  // --- HEDİYE AY STATE'LERİ ---
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  // YENİ: Hediyenin BAŞLAYACAĞI ay ('YYYY-AyIndex'). Varsayılan: içinde bulunulan ay.
  // Böylece "Hediye Ay Ver" butonu, sözleşme yılının başına değil, SEÇİLEN AYA hediye uygular.
  const [giftStartMonthKey, setGiftStartMonthKey] = useState(`${new Date().getFullYear()}-${new Date().getMonth()}`);
  const [giftMonthValue, setGiftMonthValue] = useState(1);

  // --- ÜCRETSİZ ODA STATE'LERİ ---
  const [isFreeRoomModalOpen, setIsFreeRoomModalOpen] = useState(false);
  const [freeRoomReasonInput, setFreeRoomReasonInput] = useState('');

  // --- GİRİŞ-ÇIKIŞ STATE'LERİ ---
  const [isEntryExitModalOpen, setIsEntryExitModalOpen] = useState(false);
  const [entryExitData, setEntryExitData] = useState({ newSealNo: '', protocolPhoto: null, finalPhoto: null });
  // YENİ EKLENEN: Giriş-Çıkış modalında "Yükle" açılır seçenek menüsü (hangi alanın açık olduğu)
  const [entryExitUploadMenu, setEntryExitUploadMenu] = useState(null); // 'protocol' | 'final' | null

  // YENİ: Vekalet Tutanağı — yetki verilen kişinin bilgileri (Giriş-Çıkış İşlemi ve Depodan Çıkış modallarında kullanılır)
  const [vekaletData, setVekaletData] = useState({ vekilName: '', vekilTc: '' });
  // YENİ: Oda İlk Giriş Görseli düzenleme modu — kalem butonuyla açılır, Değiştir/Sil butonları o zaman görünür
  const [isEditingEntryMedia, setIsEditingEntryMedia] = useState(false);
  // YENİ: Dashboard "Sembol Nakliyat" kartı segmenti: 'getiren' | 'cikis' | 'toplam'
  const [sembolCardMode, setSembolCardMode] = useState('getiren');

  // YENİ EKLENEN: Giriş-Çıkış Tutanağını müşteri bilgileriyle doldurup yazdırır (imza alanlı)
  const handlePrintEntryExitProtocol = () => {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;
      const customer = customers.find(c => c.name === room.customerName);
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const companyName = contractSettings.accountHolder || 'SEMBOL NAKLİYAT DEPOCULUK TİC. LTD. ŞTİ.';
      const sealFee = Number(collectionRates.sealFee) || 200;

      const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>DepoEvim Giriş-Çıkış Tutanağı</title>
      <style>
        @page { size: A4; margin: 20mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
        * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        body { color: #1f2937; line-height: 1.7; }
        .head { text-align:center; border-bottom: 3px solid #dc2626; padding-bottom: 14px; margin-bottom: 26px; }
        .head .brand { font-size: 30px; font-weight: 900; letter-spacing: 1px; color:#111827; }
        .head .brand span { color:#dc2626; }
        .head .sub { font-size: 11px; letter-spacing: 3px; color:#6b7280; margin-top:2px; text-transform:uppercase; }
        h1 { text-align:center; color:#dc2626; font-size: 22px; margin: 20px 0 26px; letter-spacing:0.5px; }
        .body-text { font-size: 15px; font-weight:600; margin-bottom: 22px; }
        .fill { display:inline-block; min-width: 220px; border-bottom: 1.5px solid #111827; font-weight:800; text-align:center; padding: 0 6px; }
        .fill.small { min-width: 90px; }
        .info { font-size: 15px; font-weight:800; margin: 6px 0; }
        .warn { font-size: 13px; color:#374151; margin: 22px 0; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 14px; }
        .sign { margin-top: 50px; }
        .sign-row { display:flex; justify-content:space-between; margin-top: 40px; }
        .sign-box { width: 45%; text-align:center; }
        .sign-line { border-top: 1.5px solid #111827; padding-top: 8px; font-weight:700; font-size: 13px; }
        .foot { margin-top: 60px; text-align:center; font-size: 10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:12px; }
        .foot b { color:#111827; }
      </style></head><body>
        <div class="head">
          <img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" style="height:44px; object-fit:contain; margin:0 auto 6px; display:block;" />
        </div>
        <h1>DEPO GİRİŞ / ÇIKIŞ TUTANAĞI</h1>
        <p class="body-text">
          ${companyName} firmasının deposunda bulunan
          <span class="fill">${customer?.name || room.customerName || '..............................'}</span> isimli
          <span class="fill small">${room.name || '............'}</span> oda numaralı depoya giriş yapmış olup;
          depolama alanında olabilecek tüm hasarların ve eksik eşyaların sorumluluğu şahsıma aittir.
        </p>
        <div class="info">GİRİŞ TARİHİ : ${dd} / ${mm} / ${yyyy}</div>
        <div class="info">SAAT : &nbsp; GİRİŞ ....... / .......  &nbsp;&nbsp;–&nbsp;&nbsp; ÇIKIŞ ....... / .......</div>
        <div class="info">YENİ MÜHÜR NO : <span class="fill small">${entryExitData.newSealNo || '............'}</span></div>
        <div class="info">MÜŞTERİ NO : ${customer?.customerNo || '............'} &nbsp;&nbsp;|&nbsp;&nbsp; TEL : ${customer?.phone || '............'}</div>
        <div class="warn">
          <strong>MÜHÜR DEĞİŞTİRME ÜCRETİ ${sealFee.toLocaleString('tr-TR')} TL + KDV</strong> faturanıza eklenecektir. (1 saatlik ücrettir.)
        </div>
        <div class="sign">
          <div class="sign-row">
            <div class="sign-box"><div class="sign-line">Müşteri Ad Soyad / İmza</div></div>
            <div class="sign-box"><div class="sign-line">Yetkili / İmza - Kaşe</div></div>
          </div>
        </div>
        <div class="foot">
          <b>${companyName}</b><br/>
          Bahçelievler Mah. Yeni Sokak No:5 C Pendik / İstanbul<br/>
          0(216) 390 89 99 · 0(554) 726 16 61 · www.sembolevdeneve.com
        </div>
        <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
      </body></html>`;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 60000);
  };

  // YENİ EKLENEN: Giriş-Çıkış Tutanağını WhatsApp ile müşteriye gönderir (hazır bilgilendirme metni)
  const handleShareEntryExitProtocol = () => {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (!room) return;
      const customer = customers.find(c => c.name === room.customerName);
      const today = new Date();
      const dateStr = today.toLocaleDateString('tr-TR');
      const sealFee = Number(collectionRates.sealFee) || 200;
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';

      const text = `📄 *DEPOEVİM GİRİŞ / ÇIKIŞ TUTANAĞI*\n\nDeğerli müşterimiz *${customer?.name || room.customerName || ''}*,\n\nAşağıdaki bilgilerle deponuza giriş/çıkış işlemi kaydedilmiştir:\n\n• Oda No: *${room.name || '-'}*\n• Müşteri No: *${customer?.customerNo || '-'}*\n• İşlem Tarihi: *${dateStr}*\n• Yeni Mühür No: *${entryExitData.newSealNo || '-'}*\n\nDepolama alanında olabilecek tüm hasarların ve eksik eşyaların sorumluluğu tarafınıza aittir.\n\n⚠️ Mühür değiştirme ücreti *${sealFee.toLocaleString('tr-TR')} TL + KDV* faturanıza eklenecektir (1 saatlik ücrettir).\n\nTutanağın imzalı aslı için lütfen depo yetkilimizle iletişime geçiniz.\n\n${companyName}\nDepoEvim`;
      const encoded = encodeURIComponent(text);

      // Telefon numarasını normalize et (boşluk/tire temizle, baştaki 0/90 kaldır)
      let rawPhone = String(customer?.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);

      window.open(`https://wa.me/90${rawPhone}?text=${encoded}`, '_blank');
  };

const handleEntryExitSave = async () => {
      if (!entryExitData.newSealNo) return;
      
      const sealFeeTotal = Number(collectionRates.sealFee) * 1.20; // Mühür ücreti + %20 KDV
      const customerToUpdate = customers.find(c => c.name === selectedRoomDetail.customerName);
      const roomToUpdate = rooms.find(r => r.id === selectedRoomId);

      // ═══════════════════════════════════════════════════════════════════════
      // YENİ EKLENEN: ÇIKIŞ YAPMIŞ MÜŞTERİYE ÜCRET YANSITILMAZ
      // Depodan tamamen çıkmış (aktif odası kalmamış) bir müşterinin carisine
      // mühür ücreti eklenmesi engellenir — çıkış sonrası bakiye SABİT kalmalıdır.
      // ═══════════════════════════════════════════════════════════════════════
      const __custHasActiveRoom = customerToUpdate
          ? rooms.some(r => r.customerName && r.customerName === customerToUpdate.name)
          : false;
      const __chargeSealFee = !!customerToUpdate && __custHasActiveRoom;

      if (db && firebaseUser) {
          try {
              // 1. Müşteri Carisine Mühür Ücreti Ekle (yalnızca AKTİF odası olan müşteriye)
              if (__chargeSealFee) {
                  const newDebt = {
                      id: Date.now(),
                      type: 'seal_fee',
                      date: new Date().toISOString().split('T')[0],
                      amount: sealFeeTotal,
                      hasKdv: true,
                      desc: `Giriş-Çıkış Yeni Mühür Ücreti`
                  };
                  const existingDebts = customerToUpdate.extraDebts || [];
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), {
                      extraDebts: [...existingDebts, newDebt]
                  }, { merge: true });
              }

              // 2. Oda Bilgilerini Güncelle (Mühür ve Arşiv)
              if (roomToUpdate) {
                  const newHistoryItem = {
                      id: Date.now(),
                      date: new Date().toLocaleDateString('tr-TR'),
                      sealNo: entryExitData.newSealNo,
                      protocolPhoto: entryExitData.protocolPhoto,
                      finalPhoto: entryExitData.finalPhoto,
                      // YENİ: İşlemi yapan kullanıcı — arşiv kartının altında gösterilir
                      addedBy: currentUserProfile?.name || 'Bilinmeyen'
                  };
                  const existingHistory = roomToUpdate.entryExitHistory || [];
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), {
                      sealNo: entryExitData.newSealNo,
                      protocolPhoto: entryExitData.protocolPhoto,
                      finalPhoto: entryExitData.finalPhoto,
                      entryExitHistory: [newHistoryItem, ...existingHistory]
                  }, { merge: true });
              }
          } catch(e) { console.error("Firebase Giriş Çıkış Hatası:", e); }
      }

      setIsEntryExitModalOpen(false);
      setEntryExitData({ newSealNo: '', protocolPhoto: null, finalPhoto: null });
  };

 // YENİ: Oda profilindeki "Not" bölümü için düzenleme state'i
 const [isEditingRoomNote, setIsEditingRoomNote] = useState(false);
 const [roomNoteDraft, setRoomNoteDraft] = useState('');

 // YENİ: Oda notunu güncelle — her zaman görünen Not bölümünden çağrılır.
 // Kiralama sırasında girilen not da buradan sonradan değiştirilebilir.
 const handleUpdateRoomNote = async (note) => {
      if (!selectedRoomId) return;
      setRooms(prev => prev.map(r => String(r.id) === String(selectedRoomId) ? { ...r, roomNote: note } : r));
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), { roomNote: note }, { merge: true });
          } catch(e) { console.error("Not Güncelleme Hatası:", e); }
      }
      setIsEditingRoomNote(false);
  };

 // YENİ: Depo giriş görselini (foto/video) ekle-değiştir-sil. Oda detayındaki bölümden çağrılır.
 // media null ise siler; doluysa ekler/değiştirir ve tarih + ekleyen ismini kaydeder.
 const handleUpdateEntryMedia = async (media, mediaType) => {
      if (!selectedRoomId) return;
      const payload = media
          ? { entryPhoto: media, entryMediaType: mediaType || 'image', entryPhotoDate: new Date().toISOString(), entryPhotoBy: currentUserProfile?.name || 'Bilinmeyen' }
          : { entryPhoto: null, entryMediaType: null, entryPhotoDate: null, entryPhotoBy: null };
      // Yerel state ANINDA güncellenir (önizleme modunda da çalışır)
      setRooms(prev => prev.map(r => String(r.id) === String(selectedRoomId) ? { ...r, ...payload } : r));
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), payload, { merge: true });
          } catch(e) { console.error("Giriş Görseli Güncelleme Hatası:", e); }
      }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // YENİ EKLENEN: BİRDEN FAZLA GİRİŞ GÖRSELİ/VİDEOSU DESTEĞİ
  // Mevcut tekli alan (entryPhoto) AYNEN korunur; seçilen İLK dosya oraya,
  // kalan dosyalar yeni "entryPhotos" dizisine ([{url, mediaType}]) yazılır.
  // Böylece eski kayıtlar ve tekli alanı kullanan tüm ekranlar bozulmaz.
  // ═══════════════════════════════════════════════════════════════════════════

  // Kiralama modalında çoklu dosya seçimini işler (Şimdi Çek / Galeriden / Dosyadan)
  const handleRentMediaFiles = async (fileList) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;
      const uploaded = [];
      for (const f of files) {
          const url = await uploadImageToServer(f);
          if (url) uploaded.push({ url, mediaType: f.type.startsWith('video') ? 'video' : 'image' });
      }
      if (uploaded.length === 0) return;
      setRentData(prev => {
          const first = !prev.entryPhoto ? uploaded[0] : null;   // ana alan boşsa ilk dosya oraya
          const rest = first ? uploaded.slice(1) : uploaded;      // kalanlar ek galeriye
          return {
              ...prev,
              entryPhoto: first ? first.url : prev.entryPhoto,
              entryMediaType: first ? first.mediaType : prev.entryMediaType,
              entryPhotos: [...(prev.entryPhotos || []), ...rest]
          };
      });
  };

  // Oda profilinde çoklu dosya seçimini işler; ana alan boşsa ilkini oraya koyar,
  // kalanları odanın entryPhotos dizisine ekler (Firebase + yerel state)
  const handleAppendEntryMediaFiles = async (fileList) => {
      if (!selectedRoomId) return;
      const files = Array.from(fileList || []);
      if (files.length === 0) return;
      const uploaded = [];
      for (const f of files) {
          const url = await uploadImageToServer(f);
          if (url) uploaded.push({ url, mediaType: f.type.startsWith('video') ? 'video' : 'image' });
      }
      if (uploaded.length === 0) return;
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      const payload = {};
      const rest = [...uploaded];
      if (!room?.entryPhoto) {
          const first = rest.shift();
          payload.entryPhoto = first.url;
          payload.entryMediaType = first.mediaType;
          payload.entryPhotoDate = new Date().toISOString();
          payload.entryPhotoBy = currentUserProfile?.name || 'Bilinmeyen';
      }
      if (rest.length > 0) payload.entryPhotos = [...(room?.entryPhotos || []), ...rest];
      setRooms(prev => prev.map(r => String(r.id) === String(selectedRoomId) ? { ...r, ...payload } : r));
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), payload, { merge: true }); } catch(e) { console.error("Ek Giriş Görseli Hatası:", e); }
      }
  };

  // Ek giriş görselini (entryPhotos dizisinden) tek tek kaldırır
  const handleRemoveEntryExtra = async (idx) => {
      if (!selectedRoomId) return;
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      const arr = (room?.entryPhotos || []).filter((_, i) => i !== idx);
      setRooms(prev => prev.map(r => String(r.id) === String(selectedRoomId) ? { ...r, entryPhotos: arr } : r));
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), { entryPhotos: arr }, { merge: true }); } catch(e) { console.error(e); }
      }
  };

 const handleSetGiftMonths = async (months) => {
      // ═══════════════════════════════════════════════════════════════════════
      // GÜNCELLENDİ: HEDİYE ARTIK SEÇİLEN AYA UYGULANIR
      // ESKİ DAVRANIŞ: Hediye, bulunulan SÖZLEŞME YILININ İLK AYINDAN başlıyordu.
      // Bu yüzden Ağustos'ta hediye verildiğinde, hediye aylar öncesine (yıl
      // başına) düşüyor; içinde bulunulan ay 0 TL olmuyordu.
      // YENİ DAVRANIŞ: Pencerede seçilen ay (varsayılan: içinde bulunulan ay)
      // hediye ayı olur. Hediye o aydan itibaren "months" kadar ay sürer.
      // Cari ekstrede bu aylar 0 TL ve "(HEDİYE)" etiketiyle görünür.
      // ═══════════════════════════════════════════════════════════════════════
      let giftStartMonthIndex = 0;
      const giftRoom = rooms.find(r => String(r.id) === String(selectedRoomId));

      if (months > 0 && giftRoom) {
          // Ay sayacının başlangıcı: cari/oda dökümüyle BİREBİR aynı çıpa (ödeme tarihi, yoksa giriş tarihi)
          const _entryD = parseDateLocal(giftRoom.entryDate || '2026-01-01');
          const _anchorD = giftRoom.paymentDate && giftRoom.paymentDate.includes('-')
              ? parseDateLocal(giftRoom.paymentDate) : _entryD;
          const _anchorIdx = _anchorD.getFullYear() * 12 + _anchorD.getMonth();

          // Seçilen hediye ayı
          const _sel = String(giftStartMonthKey).split('-');
          const _selIdx = parseInt(_sel[0]) * 12 + parseInt(_sel[1]);

          // Hediye, girişten önceki bir aya verilemez → en erken giriş ayı
          giftStartMonthIndex = Math.max(0, _selIdx - _anchorIdx);
      }

      // Yerel state ANINDA güncellenir (önizleme modunda da çalışır)
      setRooms(prev => prev.map(r => String(r.id) === String(selectedRoomId) ? { ...r, giftMonths: months, giftStartMonthIndex } : r));

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), { giftMonths: months, giftStartMonthIndex }, { merge: true });
          } catch(e) { console.error("Firebase Hediye Ay Hatası:", e); }
      }

      // YENİ: Hediye verilen aylarda cari üzerinde ESKİ borç kaydı (override) varsa temizlenir;
      // aksi halde o ay 0 TL yerine eski tutarıyla görünmeye devam ederdi.
      const _giftCustomer = customers.find(c => c.name === giftRoom?.customerName);
      if (_giftCustomer && months > 0 && giftRoom) {
          const _ovPrefix = `debt-${giftRoom.id}-`;
          const _entryD2 = parseDateLocal(giftRoom.entryDate || '2026-01-01');
          const _anchorD2 = giftRoom.paymentDate && giftRoom.paymentDate.includes('-') ? parseDateLocal(giftRoom.paymentDate) : _entryD2;
          const _startIdx = _anchorD2.getFullYear() * 12 + _anchorD2.getMonth() + giftStartMonthIndex;
          // Hediye kapsamındaki ayların anahtarları
          const _giftKeys = new Set();
          for (let i = 0; i < months; i++) {
              const _idx = _startIdx + i;
              _giftKeys.add(`${_ovPrefix}${Math.floor(_idx / 12)}-${_idx % 12}`);
          }
          const _cleaned = (_giftCustomer.ledgerOverrides || []).filter(o => !(o && _giftKeys.has(o.txId)));
          if (_cleaned.length !== (_giftCustomer.ledgerOverrides || []).length) {
              if (db && firebaseUser) {
                  try {
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(_giftCustomer.id)), { ledgerOverrides: _cleaned }, { merge: true });
                  } catch (e) { console.error('Hediye Ay Cari Temizleme Hatası:', e); }
              } else {
                  setCustomers(prev => prev.map(c => c.id === _giftCustomer.id ? { ...c, ledgerOverrides: _cleaned } : c));
              }
          }
      }

      setIsGiftModalOpen(false);
  };

  const handleSetFreeRoom = async () => {
      if (!freeRoomReasonInput) return;
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), { isFreeRoom: true, freeRoomReason: freeRoomReasonInput }, { merge: true });
          } catch(e) { console.error("Firebase Ücretsiz Oda Hatası:", e); }
      }
      setIsFreeRoomModalOpen(false);
      setFreeRoomReasonInput('');
  };

  const handleRemoveFreeRoom = async () => {
      if (!window.confirm('Ücretsiz oda durumunu kaldırmak istediğinize emin misiniz?')) return;
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), { isFreeRoom: false, freeRoomReason: null }, { merge: true });
          } catch(e) { console.error("Firebase Ücretsiz Oda Kaldırma Hatası:", e); }
      }
  };

  // --- YENİ REZERVE STATE'LERİ ---
  const [isReserveRoomModalOpen, setIsReserveRoomModalOpen] = useState(false);
  const [reserveData, setReserveData] = useState({ name: '', phone: '', days: 10 });

const handleReserveRoom = async () => {
    if (!reserveData.name || !reserveData.phone) return;
    const today = new Date();
    const expiryDate = new Date(today); 
    expiryDate.setDate(expiryDate.getDate() + parseInt(reserveData.days));
    
    if (db && firebaseUser) {
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), {
                isReserved: true, 
                reservedName: reserveData.name, 
                reservedPhone: reserveData.phone, 
                reserveExpiry: expiryDate.toLocaleDateString('tr-TR'), 
                reserveExpiryTimestamp: expiryDate.getTime()
            }, { merge: true });
        } catch(e) { console.error("Firebase Rezerve Hatası:", e); }
    }
    
    setIsReserveRoomModalOpen(false); 
    setReserveData({ name: '', phone: '', days: 10 });
  };

const handleCancelReservation = async () => {
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), {
                  isReserved: false, reservedName: null, reservedPhone: null, reserveExpiry: null, reserveExpiryTimestamp: null
              }, { merge: true });
          } catch(e) { console.error("Rezerve İptal Hatası:", e); }
      }
  };

  // --- YENİ KİRALAMA VE ÖDEME STATE'LERİ ---
  const [isRentRoomModalOpen, setIsRentRoomModalOpen] = useState(false);
  const [isRentSuccessModalOpen, setIsRentSuccessModalOpen] = useState(false);
  const [rentCustomerSearch, setRentCustomerSearch] = useState('');
  // YENİ: Kiralama ekranından hızlı müşteri ekleme modalı (Yeni Müşteri Ekle sayfasıyla aynı form)
  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [rentData, setRentData] = useState({ customerName: '', entryDate: new Date().toISOString().split('T')[0], paymentDate: new Date().toISOString().split('T')[0], monthlyFee: '', hasKdv: true, sealNo: '', broughtBy: 'kendisi', teamList: '', hasDamage: false, damageDescription: '', roomNote: '', transportPrice: '', transportHasKdv: false, entryPhoto: null });


  // YENİ EKLENEN: Oda Kiralama ekranında, girilen bilgilerle müşteri sözleşmesini hazırlar.
  // Mevcut cari sözleşme şablonunu (contractSettings.clauses) oda/ödeme bilgileriyle doldurur + ödeme bilgilendirmesi ekler.
  const buildRentalContractHtml = () => {
      const room = selectedRoomDetail;
      const custName = rentData.customerName || '..............................';
      const customer = customers.find(c => c.name === custName);
      const entryD = rentData.entryDate ? new Date(rentData.entryDate) : new Date();
      const dateStr = entryD.toLocaleDateString('tr-TR');
      const base = Number(rentData.monthlyFee || 0);
      const kdvIncl = Math.round(rentData.hasKdv ? base * 1.20 : base);
      // Kiralama modalı da aynı 4 sayfalık Eşya Depolama Sözleşmesini üretir
      return buildDepoevimContractHtml({
          mAd: customer?.name || custName || '',
          mTc: customer?.tc || '',
          mTel: customer?.phone || rentData.phone || '',
          mTel2: customer?.altPhone || customer?.phone2 || '',  // DÜZELTİLDİ: yedek numara müşteri kaydında "altPhone" alanında tutuluyor; "phone2" diye bir alan yoktu, satır bu yüzden boş basılıyordu
          mAdres: customer?.address || '',
          odaNo: room?.name || '',
          dateStr,
          kdvIncl,
          depoAdres: getRoomWarehouseAddress(room)
      });
  };

  // YENİ EKLENEN: Oda detayındaki "Sözleşme İndir" — odanın GÜNCEL (en son zamlı) kirasıyla sözleşme üretir.
  // Eski cari/oda kayıtlarındaki tutarları DEĞİŞTİRMEZ; yalnızca sözleşme çıktısında güncel kirayı gösterir.
  // YENİ EKLENEN: Ortak 4 sayfalık Eşya Depolama Sözleşmesi HTML üreticisi (ekteki formatla birebir)
  const getRoomWarehouseAddress = (room) => {
      if (!room) return '';
      // 1) Blok üzerinden: room.blockId -> block.warehouseId -> warehouse.address
      let blk = blocks.find(b => String(b.id) === String(room.blockId));
      let wh = blk ? warehouses.find(w => String(w.id) === String(blk.warehouseId)) : null;
      // 2) Oda doğrudan warehouseId taşıyorsa
      if (!wh && room.warehouseId) wh = warehouses.find(w => String(w.id) === String(room.warehouseId));
      // 3) Blok adı/şube adı ile eşleşme (bazı kayıtlar isimle bağlı olabilir)
      if (!wh && room.warehouseName) wh = warehouses.find(w => w.name === room.warehouseName);
      if (!wh && blk && blk.warehouseName) wh = warehouses.find(w => w.name === blk.warehouseName);
      return wh?.address || '';
  };
  const buildDepoevimContractHtml = (p) => {
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';
      const iban = contractSettings.iban || 'TR90 0020 3000 0871 2889 0000 34';
      const bank = contractSettings.bankFullName || 'Albaraka Türk Katılım Bankası';
      const mAd = p.mAd || '';
      const mTc = p.mTc || '';
      const mTel = p.mTel || '';
      const mTel2 = p.mTel2 || '';
      const mAdres = p.mAdres || '';
      const odaNo = p.odaNo || '';
      const dateStr = p.dateStr || '';
      const kdvIncl = Number(p.kdvIncl || 0);
      // YENİ: Odanın bulunduğu şubenin adresi (yoksa varsayılan)
      const depoAdres = p.depoAdres || 'Hürriyet mahallesi Berfin Sokak No:1';
      const kase = 'https://www.sembolevdeneve.com/crm/uploads/ka%C5%9Fe.jpg';
      const logo = 'https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp';

      const footerBlock = `<div class="pg-foot">
          <div class="ff left"><div class="ff-title">HİZMET VEREN</div><img src="${kase}" class="kase" /></div>
          <div class="ff center"><img src="${logo}" class="logo" /></div>
          <div class="ff right"><div class="ff-title">DEPOLATAN KİŞİ</div><div class="ff-name">${mAd}</div></div>
      </div>`;

      return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${sanitizePdfName(p.mAd || 'Sozlesme')}</title><style>
        @page { size:A4; margin:0;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
        * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        body { margin:0; font-family:'Segoe UI',Arial,sans-serif; color:#1f2937; }
        .page { width:210mm; min-height:297mm; padding:22mm 20mm 30mm 20mm; position:relative; page-break-after:always; }
        .page:last-child { page-break-after:auto; }
        h1.title { text-align:center; font-size:19px; font-weight:800; margin:0 0 22px; color:#111827; }
        h2.madde { font-size:14px; font-weight:800; color:#111827; margin:18px 0 8px; }
        p, .txt { font-size:11.5px; line-height:1.65; color:#374151; margin:0 0 9px; text-align:justify; }
        .lbl { font-size:11.5px; line-height:1.9; color:#374151; }
        .lbl b { color:#111827; }
        .vkn { text-align:right; font-weight:700; color:#111827; font-size:11.5px; margin:2px 0 10px; }
        .sign-final { margin-top:18px; }
        .sign-final .blk { margin-bottom:14px; }
        .sign-final .blk .t { font-weight:800; font-size:12px; color:#111827; }
        .sign-final .blk .l { font-size:11.5px; color:#374151; line-height:1.8; }
        .pg-foot { position:absolute; left:20mm; right:20mm; bottom:12mm; display:flex; justify-content:space-between; align-items:flex-end; }
        .pg-foot .ff { width:33%; }
        .pg-foot .ff.center { text-align:center; }
        .pg-foot .ff.right { text-align:right; }
        .pg-foot .ff-title { font-size:9px; font-weight:800; color:#111827; letter-spacing:.5px; }
        .pg-foot .ff-name { font-size:9px; font-weight:800; color:#111827; }
        .pg-foot .kase { width:80px; margin-top:4px; mix-blend-mode:multiply; opacity:.95; }
        .pg-foot .logo { width:120px; object-fit:contain; }
      </style></head><body>

      <div class="page">
        <h1 class="title">Eşya Depolama Sözleşmesi</h1>
        <h2 class="madde">Madde 1 - TARAFLAR</h2>
        <p>İşbu eşya depolama sözleşmesi (bundan böyle "<b>Sözleşme</b>" olarak anılacaktır) aşağıda belirtilen taraflar arasında imzalanmıştır:</p>
        <p class="lbl">Hizmet Veren Adres: <b>BAHÇELİEVLER MAH. YENİ SK. RAVZA APT. NO: 5 C PENDİK/İSTANBUL</b> adresinde mukim.</p>
        <p class="lbl">Hizmet Veren Ad Soyad / Ünvan: <b>${companyName}</b></p>
        <div class="vkn">Kartal Vergi Dairesi - Vergi No: 7600944287</div>
        <p class="lbl">Depolatan Kişinin Ad Soyad / Ünvan: <b>${mAd}</b></p>
        <p class="lbl">T.C. Kimlik No / Vergi No: <b>${mTc}</b></p>
        <p class="lbl">Depolatan Kişinin İletişim Numarası: <b>${mTel}</b></p>
        <p class="lbl">Depolatan Kişinin Yedek İletişim Numarası: <b>${mTel2}</b></p>
        <p class="lbl">Depolatan Kişinin Oda Numarası: <b>${odaNo}</b></p>
        <p class="lbl">Depolatan Kişinin Adres: <b>${mAdres}</b></p>
        <p style="margin-top:8px"><b>Bundan sonra "Depolatan kişi" olarak bahsedilecektir.</b></p>
        <h2 class="madde">Madde 2 - TANIMLAR</h2>
        <p><b>Depo:</b> Hizmet Veren ile Depolatan Kişi arasında imzalanan bu sözleşmede Depolatan kişinin eşyalarının Hizmet Veren tarafından depolandığı yeri ifade eder.</p>
        <p class="lbl"><b>Depolama Hizmetinin Başlangıç Tarihi:</b> ${dateStr}</p>
        <p>Depolanan alanın aylık ücreti KDV dahil <b>${kdvIncl.toLocaleString('tr-TR')} TL</b>dir.</p>
        <h2 class="madde">Madde 3 - SÖZLEŞMENİN KONUSU</h2>
        <p>Bu Sözleşme, Türk Borçlar Kanunu ve ilgili mevzuat hükümlerine tabi olarak, sözleşmedeki şartlar çerçevesinde Hizmet Veren ile Depolatan Kişi arasında kabul ve imza edilen, tarafların hak ve yükümlülüklerini gösteren aşağıda adresi belirtilen mülkte Hizmet Veren tarafından Depolatan Kişi'ye ait eşyaların depolanma hizmetine ilişkin sözleşmedir. Eşya Depolama hizmetinin verildiği yerin (bundan böyle 'Depo' olarak bahsedilecektir) adres bilgisi şu şekildedir:</p>
        ${footerBlock}
      </div>

      <div class="page">
        <p class="lbl"><b>Depo Adresi:</b></p>
        <p class="lbl"><b>${depoAdres}</b></p>
        <p>Eşyaların bulunduğu adresten olası bir zorunlu tahliye işleminde eşyaların başka bir depo adresine taşınması durumunda depolayan kişiye sözlü ve ya yazılı olarak bildirilecektir.</p>
        <h2 class="madde">Madde 4 - SÖZLEŞMENİN SÜRESİ</h2>
        <p>İşbu sözleşme belirtilen tarihten itibaren geçerli sayılacaktır.</p>
        <p>Depolama sözleşmesi depolayan kişinin giriş tarihinden çıkış tarihine kadar geçerlidir. Herhangi bir taahhüt zorunluluğu yoktur. Depolayan kişi istediği zaman tüm borçlarını ödeyip tüm eşyasını teslim alıp sözleşmeyi fesih edebilir.</p>
        <h2 class="madde">Madde 5 - DEPO ÜCRETİ</h2>
        <p>Sözleşmeye göre depolayan kişinin aylık depolama bedeli her ay giriş tarihinden itibaren düzenli olarak hizmet veren kişinin IBAN'ına ödeme yapacaktır. Depo ücretine KDV dahildir.</p>
        <p>Depolayan kişi depo ücretini en geç giriş tarihinden 5 gün sonra yatırabilir. Depo ücretinin ödenmemesi durumunda olabilecek gecikme faizi yansıtılacaktır. Aylık ödeme kredi kartı ile yapılamaz. Hizmet veren firmanın kampanya durumu olmadığı müddetçe ödemenin IBAN yoluyla sağlanması gerekmektedir.</p>
        <p>C- Eşya Sahibi, Depo ücretini aşağıda belirtilen banka hesaba yatıracaktır.</p>
        <p class="lbl">Banka Adı: <b>${bank}</b></p>
        <p class="lbl">Iban: <b>${iban}</b></p>
        <p class="lbl">Hesap Sahibi: <b>${companyName}</b></p>
        <h2 class="madde">Madde 6 - DEPO SORUMLULUK</h2>
        <p>Depolanacak eşyalar depoya indirilirken kısmen fotoğraf veya video kayıt altına alınacaktır. Depolanacak eşyaların içine konan eşyaların ne olduğu kaç adet olduğu ya da ne kadar değerli olduğu firmanın hizmet konusu değildir. Hizmet veren sadece depolanacak alanın güvenliğini ve depolayan kişi haricinden başka birinin girmemesini korumaktadır.</p>
        ${footerBlock}
      </div>

      <div class="page">
        <p>Hizmet Veren eşyaları Depo içinde zarar görmeyecek uygun şartlar altında saklamakla sorumludur. Ayrıca olası risklere karşı sigorta ile teminat altına almakla yükümlüdür.</p>
        <p>Olası yangın, hırsızlık, deprem gibi eşyanın uğrayacağı hasar ve kayıp rizikolarına karşı sigorta poliçesi hazırlanmamışsa Hizmet Veren zararları karşılamakla sorumludur.</p>
        <p>Hizmet Veren eşyalarda meydana gelebilecek doğal eskime ve yıpranmalardan sorumlu tutulamaz.</p>
        <p>Depolatan kişi hizmet verene en az 3 gün önceden bilgi vermek koşulu ile herhangi bir depo borcu olmaksızın mesai saatleri içinde depo ziyareti yapabilir ve dilerse eşyalarının bir kısmını teslim alabilir. Depolayan kişi depoya giriş yapmadan önce Giriş - Çıkış tutanağı imzalaması gerekmektedir.</p>
        <p>Hizmet veren tarafından verilen nakliyat hizmetleri ayrıca fiyatlandırılacaktır. Depolatan kişi depo ücretini veya birikmiş ödemelerini yapmadan eşyaları teslim alamaz.</p>
        <p>Depolanacak eşyalar depoya koyulduktan sonra kapılara mühür koyulup kayıt altına alınacaktır.</p>
        <p>Depolatan kişi aylık kira süresi dolduktan sonra 1 gün bile geçse bir sonraki ayın ödemesinin tamamını yapmayı taahhüt eder.</p>
        <p>Hizmet veren firma depolatan kişinin kendine ait kiraladığı odaya koyduğu eşyaların içeriğini bilmediğinden dolayı gayri resmi yasal olmayan depolama içeriklerinden sorumlu değildir. Depolatan kişi tüm sorumluluğu kendi üzerine almıştır.</p>
        <p>Depo içerisinden eşya alımı için depolatan kişi kendi imkanlarıyla alır ve eski haline getirmesi gerekir. Aksi halde eski haline getirildikten sonra işçilik maaliyeti yansıtılacaktır.</p>
        <p>Kapılara atılan mühürler tek kullanımlıktır. Mühür yenileme ücreti 200 TL + KDV dir.</p>
        <p>Depolanacak eşyaların içinde herhangi bir gıda malzemesi bulunmaması gerekmektedir. Bu sebepten dolayı oluşabilecek hasardan depolatan kişi sorumludur.</p>
        <p>Depolanacak eşyaların içinde bulunan döviz, hisse senedi, para, silah, ziynet eşyası ve değerli eşyalardan firmamız mesul değildir.</p>
        <h2 class="madde">Madde 7 - SÖZLEŞME FESHİ</h2>
        <p>Depolatan kişi depolanan eşyanın teslimi için hizmet veren firmaya en az 7 gün öncesinden bilgi vermesi halinde istediği tarihte eşyalarının nakliyesini isteyebilir.</p>
        <p>Depolatan kişi depo ücretini birbirini takip eden üç aylık ödeme döneminde ödemez ise Hizmet veren eşyaları tahliye etme hakkına sahip olacaktır. Tahliye sırasında oluşabilecek eksik ve hasarlı eşyalar hizmet veren firmanın sorumluluğunda değildir. Tahliye işleminde oluşan nakliye masrafları depolatan kişiye yansıtılacaktır.</p>
        ${footerBlock}
      </div>

      <div class="page">
        <p>Depolatan kişi tahliyeden sonraki 3 ay boyunca güncel depo bedeli ve eklenmiş tahliye masraflarını ödemekle yükümlüdür. Ödenmemiş 3 aylık ödeme dönemi ve 3 aylık tahliye süreci tamamlanınca eşyaların duyuru yapılmaksızın ihale ile satışa sunulacaktır.</p>
        <p>Süre bitiminden önce taraflardan biri sözleşmeyi yenilemeyeceğini karşı tarafa yazılı olarak bildirmezse sözleşme aynı şartlarla hizmet bedeli bir önceki yılın fiyatının TEFE-TÜFE artış oranı dikkate alınmak suretiyle yeni kira bedeli belirlenerek otomatik yenilenecektir.</p>
        <p>Toplu ödemelerde yapılan indirim kampanyası belirlenen süre için geçerlidir. Bu süreden önce eşyaların teslim alınması halinde hediye tutarı geri iade edilmeyecektir. Hediye ayları çıkarıldığında kalan ayların iadesi yapılacaktır. Kredi kartı ile yapılan toplu ödemelerde kesintiler hesaplanıp iadesi alınacaktır.</p>
        <p>Nakliye hizmeti hizmet veren firmadan alınmamış ise hizmet veren firmanın kalıcı ambalajının (pat pat) eşyalar depodan çıkarken iadesinin alınması mecburidir.</p>
        <h2 class="madde">Madde 8 - TEBLİGAT ADRESLERİ</h2>
        <p>Hizmet verenin ve depolatan kişinin yukarda yazılı olan adresleri geçerli tebligat adresleridir. Tarafların tebligat adresinde olabilecek değişiklikler, değişimi takip eden 3 (üç) gün içerisinde diğer tarafa internet üzerinden veya yazılı olarak bildirilecektir. Bildirmediği takdirde sözleşmedeki adreslere yapılacak tebligatlar taraflara yapılmış olarak kabul edilecektir.</p>
        <h2 class="madde">Madde 9 - YETKİLİ MAHKEME VE İCRA DAİRESİ</h2>
        <p>İşbu Sözleşmenin, eklerinin, tadillerinin uygulanmasından veya yorumundan doğabilecek ihtilaflarda Türk Kanunları uygulanır ve taraflarca aksine bir hüküm kararlaştırılmadıkça HMK kuralları doğrultusunda yetkili mahkeme ve icra daireleri belirlenir.</p>
        <h2 class="madde">Madde 10 - YÜRÜRLÜK</h2>
        <p>İşbu Sözleşme taraflarca imzalandığı tarihte yürürlüğe girer ve daha erken feshedilmedikçe Sözleşmede belirtilen şekilde sona erer.</p>
        <p>İşbu Sözleşme 4 (dört) sayfadan oluşmaktadır. Sözleşmede yer almayan hususlar hakkında 6098 sayılı Borçlar Kanunu hükümleri geçerlidir.</p>
        <p>İşbu sözleşme, taraflarca tüm hususlarda mutabık kalınarak 2 nüsha olmak üzere belirtilen tarihte birlikte imza altına alınmıştır. Depolatan kişinin depolama günü depo adresine gelmediği takdirde sözleşme tarafına internet yoluyla iletilecektir ve kabul ettiği varsayılacaktır</p>
        <div class="sign-final">
          <div class="blk"><div class="t">HİZMET VEREN</div><div class="l">Ad Soyad / Ünvan: <b>${companyName}</b><br/>İmza Yetkili Kişi Ad Soyad:<br/>İmza:</div></div>
          <div class="blk"><div class="t">DEPOLATAN KİŞİ</div><div class="l">Ad Soyad / Ünvan: <b>${mAd}</b><br/>İmza Yetkili Kişi Ad Soyad:<br/>İmza:</div></div>
        </div>
        ${footerBlock}
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print();},400);};</script></body></html>`;
  };

  const handlePrintRoomCurrentContract = () => {
      const room = selectedRoomDetail;
      if (!room) return;
      const customer = customers.find(c => c.name === room.customerName);
      const entryD = parseDateLocal(room.entryDate || '2026-01-01');
      const dateStr = entryD.toLocaleDateString('tr-TR');
      const base = Math.max(Number(room.monthlyFee || 0), Number(getRoomFeeForMonth(room, new Date().getFullYear(), new Date().getMonth()) || 0));
      const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
      const kdvIncl = Math.round(hasKdv ? base * 1.20 : base);
      const html = buildDepoevimContractHtml({
          mAd: customer?.name || room.customerName || '',
          mTc: customer?.tc || '',
          mTel: customer?.phone || '',
          mTel2: customer?.altPhone || customer?.phone2 || '',  // DÜZELTİLDİ: yedek numara müşteri kaydında "altPhone" alanında tutuluyor; "phone2" diye bir alan yoktu, satır bu yüzden boş basılıyordu
          mAdres: customer?.address || '',
          odaNo: room.name || '',
          dateStr,
          kdvIncl,
          depoAdres: getRoomWarehouseAddress(room)
      });
      setPdfFileName(sanitizePdfName(`${customer?.name || room.customerName || 'Sozlesme'} - ${room.name || ''} Sozlesme`));

      const iframe = document.createElement('iframe');
      iframe.style.position='fixed'; iframe.style.right='0'; iframe.style.bottom='0'; iframe.style.width='0'; iframe.style.height='0'; iframe.style.border='0';
      document.body.appendChild(iframe);
      const docu = iframe.contentWindow.document; docu.open(); docu.write(html); docu.close();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 60000);
  };

  // YENİ EKLENEN: Oda güncel sözleşmesini DOĞRUDAN PDF olarak indir (yeni sekmede açar, dosya adı = müşteri)
  const handleDownloadRoomCurrentContract = () => {
      const room = selectedRoomDetail;
      if (!room) return;
      const customer = customers.find(c => c.name === room.customerName);
      const entryD = parseDateLocal(room.entryDate || '2026-01-01');
      const dateStr = entryD.toLocaleDateString('tr-TR');
      const base = Math.max(Number(room.monthlyFee || 0), Number(getRoomFeeForMonth(room, new Date().getFullYear(), new Date().getMonth()) || 0));
      const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
      const kdvIncl = Math.round(hasKdv ? base * 1.20 : base);
      const html = buildDepoevimContractHtml({
          mAd: customer?.name || room.customerName || '',
          mTc: customer?.tc || '',
          mTel: customer?.phone || '',
          mTel2: customer?.altPhone || customer?.phone2 || '',  // DÜZELTİLDİ: yedek numara müşteri kaydında "altPhone" alanında tutuluyor; "phone2" diye bir alan yoktu, satır bu yüzden boş basılıyordu
          mAdres: customer?.address || '',
          odaNo: room.name || '',
          dateStr,
          kdvIncl,
          depoAdres: getRoomWarehouseAddress(room)
      });
      const fileName = sanitizePdfName(`${customer?.name || room.customerName || 'Sozlesme'} - ${room.name || ''} Sozlesme`);
      setPdfFileName(fileName);
      // Yeni sekmede aç: kullanıcı Paylaş/Kaydet ile PDF olarak indirir (iOS + masaüstü uyumlu)
      const w = window.open('', '_blank');
      if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
      } else {
          // Popup engellendiyse iframe ile yazdırma diyaloğuna düş
          handlePrintRoomCurrentContract();
      }
  };

  // YENİ EKLENEN: Oda detayı — güncel kira sözleşmesini WhatsApp'tan paylaş
  const handleShareRoomCurrentContract = () => {
      const room = selectedRoomDetail;
      if (!room) return;
      const customer = customers.find(c => c.name === room.customerName);
      if (!customer) { alert('Sözleşmeyi paylaşmak için odaya bağlı kayıtlı bir müşteri olmalı.'); return; }
      const base = Math.max(Number(room.monthlyFee || 0), Number(getRoomFeeForMonth(room, new Date().getFullYear(), new Date().getMonth()) || 0));
      const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
      const kdvIncl = Math.round(hasKdv ? base * 1.20 : base);
      const dateStr = parseDateLocal(room.entryDate || '2026-01-01').toLocaleDateString('tr-TR');
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';
      const iban = contractSettings.iban || 'TR90 0020 3000 0871 2889 0000 34';
      const bank = contractSettings.bankFullName || 'Albaraka Türk Katılım Bankası';
      const text = `📄 *EŞYA DEPOLAMA SÖZLEŞMESİ / ÖDEME BİLGİLENDİRMESİ*\n\nDeğerli müşterimiz *${customer.name}*,\n\n• Oda No: *${room.name || '-'}*\n• Giriş Tarihi: *${dateStr}*\n• Güncel Aylık Kira (KDV Dahil): *${kdvIncl.toLocaleString('tr-TR')} TL*\n• Müşteri No: *${customer.customerNo || '-'}*\n\n💳 *Ödeme Bilgileri*\nBanka: ${bank}\nHesap Sahibi: ${companyName}\nIBAN: ${iban}\n\n⚠️ Ödeme açıklamasına mutlaka *${customer.customerNo || 'Müşteri No'}* numaranızı yazınız.\n\n${companyName}\nDepoEvim`;
      const encoded = encodeURIComponent(text);
      let rawPhone = String(customer.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);
      window.open(`https://wa.me/90${rawPhone}?text=${encoded}`, '_blank');
  };

  const handlePrintRentalContract = () => {
      if (!rentData.customerName) { alert('Lütfen önce müşteri seçin.'); return; }
      const html = buildRentalContractHtml();
      setPrintFileName(rentData.customerName, 'sozlesme');
      const iframe = document.createElement('iframe');
      iframe.style.position='fixed'; iframe.style.right='0'; iframe.style.bottom='0'; iframe.style.width='0'; iframe.style.height='0'; iframe.style.border='0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document; doc.open(); doc.write(html); doc.close();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 60000);
  };

  const handleShareRentalContract = () => {
      const custName = rentData.customerName;
      const customer = customers.find(c => c.name === custName);
      if (!customer) { alert('Sözleşmeyi paylaşmak için kayıtlı bir müşteri seçili olmalı.'); return; }
      const room = selectedRoomDetail;
      const base = Number(rentData.monthlyFee || 0);
      const kdvIncl = Math.round(rentData.hasKdv ? base * 1.20 : base);
      const dateStr = (rentData.entryDate ? new Date(rentData.entryDate) : new Date()).toLocaleDateString('tr-TR');
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';
      const iban = contractSettings.iban || '';
      const bank = contractSettings.bankFullName || '';
      const text = `📄 *DEPOEVİM KİRALAMA SÖZLEŞMESİ / ÖDEME BİLGİLENDİRMESİ*\n\nDeğerli müşterimiz *${custName}*,\n\n• Oda No: *${room?.name || '-'}*\n• Giriş Tarihi: *${dateStr}*\n• Aylık Kira (KDV Dahil): *${kdvIncl.toLocaleString('tr-TR')} TL*\n• Müşteri No: *${customer.customerNo || '-'}*\n\n💳 *Ödeme Bilgileri*\nBanka: ${bank}\nHesap Sahibi: ${companyName}\nIBAN: ${iban}\n\n⚠️ Ödeme açıklamasına mutlaka *${customer.customerNo || 'Müşteri No'}* numaranızı yazınız.\n\n${companyName}\nDepoEvim`;
      const encoded = encodeURIComponent(text);
      let rawPhone = String(customer.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);
      window.open(`https://wa.me/90${rawPhone}?text=${encoded}`, '_blank');
  };

const handleRentRoom = async () => {
      if (!rentData.customerName || !rentData.monthlyFee) return;
      logActivity('Oda Kiralama', `${rentData.customerName} müşterisine oda kiralandı.`);

      // 1. Gün Farkı (Kıstelyevm) Bedeli Hesaplaması
      let proratedDebtAmount = 0;
      const eDate = new Date(rentData.entryDate);
      const pDate = new Date(rentData.paymentDate);
      const timeDiff = pDate.getTime() - eDate.getTime();
      const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      
      if (dayDiff > 0) {
          let dailyRate = Number(rentData.monthlyFee) / 30;
          proratedDebtAmount = dailyRate * dayDiff;
          if (rentData.hasKdv) proratedDebtAmount = proratedDebtAmount * 1.20;
      }

      // 2. Nakliye bedeli kaldırıldı — artık cariye nakliye ücreti yansıtılmaz.
      let transportDebtAmount = 0;

      // 3. FİREBASE CARİ HESAP GÜNCELLEMESİ (Müşteri)
      const customerToUpdate = customers.find(c => c.name === rentData.customerName);
      if (customerToUpdate && (proratedDebtAmount > 0)) {
          let existingDebts = customerToUpdate.extraDebts || [];
          let existingPayments = customerToUpdate.payments || []; 
          
          if (proratedDebtAmount > 0) {
              existingDebts = [...existingDebts, { id: Date.now() + 2, type: 'prorated', date: rentData.entryDate, amount: proratedDebtAmount, desc: `Gün Farkı Bedeli (${dayDiff} Gün)` }];
          }

          if (db && firebaseUser) {
              try {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), {
                      extraDebts: existingDebts,
                      payments: existingPayments
                  }, { merge: true });
              } catch(e) { console.error("Firebase Cari Güncelleme Hatası:", e); }
          }
      }

      // 4. FİREBASE ODA GÜNCELLEMESİ
      const roomUpdates = {
          customerName: rentData.customerName, 
          entryDate: rentData.entryDate, 
          paymentDate: rentData.paymentDate, 
          monthlyFee: rentData.monthlyFee, 
          hasKdv: rentData.hasKdv, 
          sealNo: rentData.sealNo,
          broughtBy: rentData.broughtBy,
          teamList: rentData.teamList,
          hasDamage: rentData.hasDamage,
          damageDescription: rentData.damageDescription,
          // YENİ: Duruma göre not — oda profilinde her zaman görünür, sonradan da düzenlenebilir
          roomNote: rentData.roomNote || '',
          transportPrice: rentData.transportPrice,
          transportHasKdv: rentData.transportHasKdv,
          entryPhoto: rentData.entryPhoto,
          entryMediaType: rentData.entryMediaType || 'image',
          entryPhotos: rentData.entryPhotos || [],   // YENİ: ek giriş görselleri/videoları
          // YENİ: Giriş görseli meta bilgisi — altında tarih ve ekleyen ismi gösterilir
          entryPhotoDate: rentData.entryPhoto ? new Date().toISOString() : null,
          entryPhotoBy: rentData.entryPhoto ? currentUserProfile.name : null,
          paidMonths: [],
          rentedBy: currentUserProfile.name,
          isReserved: false, // Varsa rezerveyi iptal et
          reservedName: null,
          reservedPhone: null,
          reserveExpiry: null,
          reserveExpiryTimestamp: null
      };

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), roomUpdates, { merge: true });
          } catch(e) { console.error("Firebase Oda Kiralama Hatası:", e); }
      }

      // 5. EKRAN DURUMLARINI SIFIRLAMA
      setIsRentRoomModalOpen(false); 
      setIsRentSuccessModalOpen(true);
      setRentData({ customerName: '', entryDate: new Date().toISOString().split('T')[0], paymentDate: new Date().toISOString().split('T')[0], monthlyFee: '', hasKdv: true, sealNo: '', broughtBy: 'kendisi', teamList: '', hasDamage: false, damageDescription: '', roomNote: '', transportPrice: '', transportHasKdv: false, entryPhoto: null });
      setRentCustomerSearch('');
  };




const handleSaveEditRent = async () => {
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), {
                  customerName: editRentData.customerName,
                  entryDate: editRentData.entryDate,
                  paymentDate: editRentData.paymentDate,
                  monthlyFee: editRentData.monthlyFee,
                  hasKdv: editRentData.hasKdv,
                  sealNo: editRentData.sealNo
              }, { merge: true });
          } catch (e) { console.error("Firebase Oda Düzenleme Hatası:", e); }
      }
      setIsEditRentModalOpen(false);
  };

  // YENİ EKLENEN: VEKALET TUTANAĞI üreticisi.
  // type: 'giris-cikis' → vekile odaya giriş-çıkış yetkisi | 'teslim' → vekile eşyaları teslim alma yetkisi
  // vekilName / vekilTc: yetki verilen kişinin bilgileri (modaldan elle girilir).
  const buildVekaletHtml = (type, vekilName, vekilTc) => {
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      if (!room) return '';
      const customer = customers.find(c => c.name === room.customerName);
      const custName = customer?.name || room.customerName || '..............................';
      const custTc = customer?.tc || '';
      const roomName = room.name || '............';
      const today = new Date();
      const todayStr = today.toLocaleDateString('tr-TR');
      const companyName = contractSettings.accountHolder || 'SEMBOL NAKLİYAT DEPOCULUK TİC. LTD. ŞTİ.';
      const logo = 'https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp';

      const vName = vekilName || '..............................';
      const vTc = vekilTc || '..............................';

      const isTeslim = type === 'teslim';
      const baslik = isTeslim ? 'DEPOEVİM EŞYA TESLİM VEKALET TUTANAĞI' : 'DEPOEVİM DEPO GİRİŞ-ÇIKIŞ VEKALET TUTANAĞI';
      // İki farklı yetki metni
      const govde = isTeslim
          ? `${companyName} firmasının deposunda bulunan <b>${custName}</b> isimli, <b>${roomName}</b> oda numaralı depoda depolanan tüm eşyalarımı; benim adıma <b>${vName}</b> (T.C. Kimlik No: <b>${vTc}</b>) isimli kişinin benim nezaretim olmadan <b>teslim almaya, taşımaya ve depoyu tahliye etmeye</b> yetkili olduğunu beyan ve kabul ederim. Teslim edilen eşyalardan doğabilecek her türlü sorumluluk tarafıma aittir.`
          : `${companyName} firmasının deposunda bulunan <b>${custName}</b> isimli, <b>${roomName}</b> oda numaralı depoya; benim adıma <b>${vName}</b> (T.C. Kimlik No: <b>${vTc}</b>) isimli kişinin benim nezaretim olmadan <b>giriş ve çıkış yapabileceğini</b> beyan ve kabul ederim. Bu süreçte depolama alanında oluşabilecek her türlü sorumluluk tarafıma aittir.`;

      return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${sanitizePdfName(custName + ' - Vekalet')}</title>
      <style>
        /* Tek sayfa: kenar boşlukları daraltıldı, tüm margin-box kutuları boşaltıldı (tarayıcı üst/alt yazısı gizlenir) */
        @page { size:A4; margin:12mm 16mm; @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""} }
        html, body { height:auto; }
        * { box-sizing:border-box; font-family:'Segoe UI', Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        /* min-height kaldırıldı; içerik doğal yüksekliğinde kalır, ikinci sayfaya taşmaz */
        body { color:#1f2937; line-height:1.55; margin:0; }
        .wrap { page-break-inside:avoid; }
        .head { text-align:center; border-bottom:2px solid #dc2626; padding-bottom:10px; margin-bottom:16px; }
        .head img { height:40px; object-fit:contain; display:block; margin:0 auto; }
        h1 { text-align:center; color:#dc2626; font-size:17px; margin:14px 0 18px; letter-spacing:.3px; }
        .content { font-size:13px; text-align:justify; margin-bottom:14px; }
        .info-box { background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:12px 14px; margin:14px 0; }
        .info-box .row { font-size:12.5px; margin:4px 0; }
        .info-box .row b { display:inline-block; min-width:180px; color:#111827; }
        .date { font-size:13px; font-weight:700; margin-top:14px; }
        .signatures { display:flex; justify-content:space-between; margin-top:44px; }
        .sig-box { width:45%; text-align:center; }
        .sig-title { font-weight:800; font-size:12px; color:#111827; }
        .sig-name { font-size:12px; color:#374151; margin:6px 0 34px; }
        .sig-line { border-top:1.5px solid #111827; padding-top:8px; font-weight:700; font-size:12px; }
        .foot { text-align:center; font-size:10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:10px; margin-top:34px; line-height:1.5; }
        .foot b { color:#111827; }
      </style></head><body>
        <div class="wrap">
        <div class="head"><img src="${logo}" alt="Depoevim" /></div>
        <h1>${baslik}</h1>
        <div class="content"><p>${govde}</p></div>
        <div class="info-box">
          <div class="row"><b>Depolatan (Müşteri):</b> ${custName}</div>
          <div class="row"><b>Müşteri T.C. Kimlik No:</b> ${custTc || '..............................'}</div>
          <div class="row"><b>Oda Numarası:</b> ${roomName}</div>
          <div class="row"><b>Yetki Verilen Kişi:</b> ${vName}</div>
          <div class="row"><b>Yetkili T.C. Kimlik No:</b> ${vTc}</div>
        </div>
        <div class="date">Tarih: ${todayStr}</div>
        <div class="signatures">
          <div class="sig-box"><div class="sig-title">Müşteri (Depolatan)</div><div class="sig-name">${custName}</div><div class="sig-line">Ad Soyad / İmza</div></div>
          <div class="sig-box"><div class="sig-title">Yetki Verilen Kişi</div><div class="sig-name">${vName}</div><div class="sig-line">Ad Soyad / İmza</div></div>
        </div>
        <div class="foot"><b>${companyName}</b><br/>Bahçelievler Mah. Yeni Sokak No:5 C Pendik / İstanbul<br/>0(216) 390 89 99 · 0(554) 726 16 61 · www.sembolevdeneve.com</div>
        </div>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
      </body></html>`;
  };

  // Vekalet tutanağını yazdır (iframe ile yazdırma diyaloğu)
  const handlePrintVekalet = (type) => {
      const html = buildVekaletHtml(type, vekaletData.vekilName, vekaletData.vekilTc);
      if (!html) return;
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      const customer = customers.find(c => c.name === room?.customerName);
      setPdfFileName(sanitizePdfName(`${customer?.name || 'Musteri'} - Vekalet Tutanagi`));
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
      iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 60000);
  };

  // Vekalet tutanağını WhatsApp ile müşteriye gönder (bilgilendirme metni)
  const handleShareVekalet = (type) => {
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      if (!room) return;
      const customer = customers.find(c => c.name === room.customerName);
      const isTeslim = type === 'teslim';
      const yetkiTuru = isTeslim ? 'eşyalarınızı teslim alma' : 'odaya giriş-çıkış yapma';
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk';
      const text = `📄 *DEPOEVİM VEKALET TUTANAĞI*\n\nDeğerli müşterimiz *${customer?.name || room.customerName || ''}*,\n\n*${room.name}* numaralı odanız için, *${vekaletData.vekilName || '-'}* (T.C. ${vekaletData.vekilTc || '-'}) isimli kişiye ${yetkiTuru} yetkisi veren vekalet tutanağı hazırlanmıştır.\n\nLütfen belgeyi inceleyip imzalayınız. İmzalı asıl nüsha için depo yetkilimizle iletişime geçebilirsiniz.\n\n${companyName}\nDepoEvim`;
      const encoded = encodeURIComponent(text);
      let rawPhone = String(customer?.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);
      window.open(`https://wa.me/90${rawPhone}?text=${encoded}`, '_blank');
  };

  // YENİ EKLENEN: Teslim Tutanağı / Nakliye Hasar Tutanağı HTML'i üretir (type: 'teslim' | 'nakliye')
  const buildExitProtocolHtml = (type) => {
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      if (!room) return '';
      const customer = customers.find(c => c.name === room.customerName);
      const exitD = endRentData.exitDate ? new Date(endRentData.exitDate) : new Date();
      const dd = String(exitD.getDate()).padStart(2, '0');
      const mm = String(exitD.getMonth() + 1).padStart(2, '0');
      const yyyy = exitD.getFullYear();
      const companyName = contractSettings.accountHolder || 'SEMBOL NAKLİYAT DEPOCULUK TİC. LTD. ŞTİ.';
      const custName = customer?.name || room.customerName || '..............................';
      const roomName = room.name || '............';

      // NAKLİYE HASAR tutanağı tek sayfaya kesin sığacak şekilde kompakt ölçeklenir.
      const isNakliye = type === 'nakliye';
      const styles = `
        @page { size: A4; margin: ${isNakliye ? '14mm' : '20mm'}; @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""} }
        * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
        html, body { height:auto; }
        body { color:#1f2937; line-height:${isNakliye ? '1.5' : '1.8'}; ${isNakliye ? 'font-size:13px;' : ''} }
        .head { text-align:center; border-bottom:3px solid #dc2626; padding-bottom:${isNakliye ? '8px' : '14px'}; margin-bottom:${isNakliye ? '14px' : '26px'}; }
        .head .brand { font-size:30px; font-weight:900; letter-spacing:1px; color:#111827; }
        .head .brand span { color:#dc2626; }
        .head .sub { font-size:11px; letter-spacing:3px; color:#6b7280; margin-top:2px; text-transform:uppercase; }
        h1 { text-align:center; color:#dc2626; font-size:${isNakliye ? '18px' : '22px'}; margin:${isNakliye ? '10px 0 16px' : '20px 0 30px'}; }
        .body-text { font-size:${isNakliye ? '13px' : '15px'}; font-weight:600; margin-bottom:${isNakliye ? '14px' : '24px'}; }
        .fill { display:inline-block; min-width:${isNakliye ? '150px' : '200px'}; border-bottom:1.5px solid #111827; font-weight:800; text-align:center; padding:0 6px; }
        .fill.small { min-width:80px; }
        .info { font-size:${isNakliye ? '13px' : '15px'}; font-weight:800; margin:${isNakliye ? '7px 0' : '10px 0'}; }
        .field { font-size:${isNakliye ? '13px' : '14px'}; margin:${isNakliye ? '9px 0' : '14px 0'}; }
        .field b { display:inline-block; min-width:230px; }
        .line { display:inline-block; min-width:260px; border-bottom:1.5px solid #111827; }
        .sign { margin-top:${isNakliye ? '32px' : '60px'}; }
        .sign-line { border-top:1.5px solid #111827; padding-top:8px; font-weight:700; font-size:13px; width:60%; }
        .foot { margin-top:${isNakliye ? '28px' : '70px'}; text-align:center; font-size:10px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:${isNakliye ? '8px' : '12px'}; }
        .foot b { color:#111827; }`;

      let inner = '';
      if (type === 'teslim') {
          inner = `
            <h1>TESLİM TUTANAĞI</h1>
            <p class="body-text">
              ${companyName} firmasının deposunda bulunan
              <span class="fill">${custName}</span> isimli
              <span class="fill small">${roomName}</span> oda numaralı depoda bulunan eşyaları,
              <b>hasarsız ve eksiksiz</b> bir şekilde teslim aldım.
            </p>
            <div class="info">TESLİM TARİHİ : ${dd} / ${mm} / ${yyyy}</div>
            <div class="info">MÜŞTERİ NO : ${customer?.customerNo || '............'} &nbsp;|&nbsp; TEL : ${customer?.phone || '............'}</div>
            <div class="sign">
              <div class="sign-line">Müşteri Ad Soyad / İmza</div>
            </div>`;
      } else {
          inner = `
            <h1>NAKLİYE HASAR TUTANAĞI</h1>
            <p class="body-text">
              ${companyName} firmasının deposunda bulunan
              <span class="fill small">${roomName}</span> oda numaralı,
              <span class="fill">${custName}</span> adlı müşteriye ait olan eşyaları teslim alırken;
              taşıma sırasında deponun içinde ve çevresinde oluşabilecek <b>tüm hasarlardan sorumlu olduğumu</b> taahhüt ederim.
            </p>
            <div class="field"><b>Nakliye Firması Ünvanı:</b> <span class="line">${endRentData.carrierName || ''}</span></div>
            <div class="field"><b>Nakliye Firması VKN:</b> <span class="line">${endRentData.carrierVkn || ''}</span></div>
            <div class="info">TESLİM TARİHİ : ${dd} / ${mm} / ${yyyy}</div>
            <div class="sign">
              <div class="sign-line">Nakliye Firması Yetkili Ad Soyad / İmza${endRentData.carrierAuthorized ? ' : ' + endRentData.carrierAuthorized : ''}</div>
            </div>`;
      }

      return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>DepoEvim Tutanak</title><style>${styles}</style></head><body>
        <div class="head"><img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" style="height:44px;object-fit:contain;display:block;margin:0 auto;" /></div>
        ${inner}
        <div class="foot"><b>${companyName}</b><br/>Bahçelievler Mah. Yeni Sokak No:5 C Pendik / İstanbul<br/>0(216) 390 89 99 · 0(554) 726 16 61 · www.sembolevdeneve.com</div>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
      </body></html>`;
  };

  const handlePrintExitProtocol = (type) => {
      const html = buildExitProtocolHtml(type);
      if (!html) return;
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
      iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open(); doc.write(html); doc.close();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} }, 60000);
  };

  // YENİ EKLENEN: Teslim/Nakliye tutanağını WhatsApp ile müşteriye gönder
  const handleShareExitProtocol = (type) => {
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      if (!room) return;
      const customer = customers.find(c => c.name === room.customerName);
      const exitD = endRentData.exitDate ? new Date(endRentData.exitDate) : new Date();
      const dateStr = exitD.toLocaleDateString('tr-TR');
      const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk Tic. Ltd. Şti';
      const custName = customer?.name || room.customerName || '';

      let text = '';
      if (type === 'teslim') {
          text = `📄 *DEPOEVİM TESLİM TUTANAĞI*\n\nDeğerli müşterimiz *${custName}*,\n\n*${room.name}* oda numaralı depoda bulunan eşyalarınızı *hasarsız ve eksiksiz* bir şekilde teslim aldığınızı onaylayan tutanaktır.\n\n• Müşteri No: *${customer?.customerNo || '-'}*\n• Teslim Tarihi: *${dateStr}*\n\nİmzalı asıl nüsha için lütfen depo yetkilimizle iletişime geçiniz.\n\n${companyName}\nDepoEvim`;
      } else {
          text = `📄 *DEPOEVİM NAKLİYE HASAR TUTANAĞI*\n\n*${room.name}* oda numaralı, *${custName}* adlı müşteriye ait eşyalar, aşağıdaki nakliye firması tarafından teslim alınmıştır. Taşıma sırasında oluşabilecek tüm hasarlardan nakliye firması sorumludur.\n\n• Nakliye Firması: *${endRentData.carrierName || '-'}*\n• VKN: *${endRentData.carrierVkn || '-'}*\n• Yetkili: *${endRentData.carrierAuthorized || '-'}*\n• Teslim Tarihi: *${dateStr}*\n\nİmzalı asıl nüsha için lütfen depo yetkilimizle iletişime geçiniz.\n\n${companyName}\nDepoEvim`;
      }
      const encoded = encodeURIComponent(text);
      let rawPhone = String(customer?.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);
      window.open(`https://wa.me/90${rawPhone}?text=${encoded}`, '_blank');
  };

const handleEndRentConfirm = async () => {
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      if (!room) return;
      // YENİ: Çıkışı kimin yaptığı zorunlu (kendisi / sembol)
      if (!endRentData.exitBy) { alert('Lütfen eşyanın çıkışını kimin yaptığını seçin (Kendisi / Sembol Nakliyat).'); return; }
      logActivity('Odadan Çıkış', `${room.customerName || ''} - ${room.name || ''} odasından çıkış yapıldı.`);
      
      const customerToUpdate = customers.find(c => c.name === room.customerName);
      let pendingDebtsToTransfer = [];

      // 1. Odaya ait ödenmemiş borçları hesapla ve kalıcı borca çevir
      if (customerToUpdate) {
          const entryDate = parseDateLocal(room.entryDate || '2026-01-01');
          const paymentAnchorDate = room.paymentDate && room.paymentDate.includes('-') ? parseDateLocal(room.paymentDate) : entryDate;
          const today = new Date(); today.setHours(23, 59, 59, 999);
          
          const baseAmt = Number(room.monthlyFee || 0);
          const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
          const monthlyTotal = hasKdv ? baseAmt * 1.20 : baseAmt;
          const overrides = customerToUpdate.ledgerOverrides || [];
          
          let loopDate = new Date(paymentAnchorDate);
          let monthCounter = 0;

          while (loopDate <= today) {
              const key = `${loopDate.getFullYear()}-${loopDate.getMonth()}`;
              const txId = `debt-${room.id}-${key}`;

              // GÜNCELLENDİ: Borç, ödeme GÜNÜ GELİNCE (aynı gün) geçerli olur; 1 gün sonraya kaydırma kaldırıldı.
              let dueDate = new Date(loopDate.getFullYear(), loopDate.getMonth(), loopDate.getDate());
              dueDate.setHours(0, 0, 0, 0);
              const isDueYet = dueDate <= today;

              let currentMonthlyTotal = monthlyTotal;
              const override = overrides.find(o => o.txId === txId);
              if (override && !override.isDeleted && override.debt !== undefined) currentMonthlyTotal = override.debt;

              const isGifted = isGiftedMonth(room, monthCounter);
              const isFree = room.isFreeRoom;
              
              if (isDueYet && !room.paidMonths?.includes(key) && !isGifted && !isFree) {
                  pendingDebtsToTransfer.push({
                      id: Date.now() + Math.random(),
                      type: 'manual_debt',
                      date: new Date(loopDate).toISOString().split('T')[0],
                      amount: currentMonthlyTotal,
                      hasKdv: false, // Tutar zaten hesaplanmış
                      desc: `${room.name} Odası Eski Kira Borcu (Çıkış Yapılan)`
                  });
              }
              const targetDay = room.paymentDate && !room.paymentDate.includes('-') ? parseInt(room.paymentDate) : paymentAnchorDate.getDate();
              let nMonth = loopDate.getMonth() + 1;
              let nYear = loopDate.getFullYear();
              if (nMonth > 11) { nMonth = 0; nYear++; }
              let maxDayInNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
              loopDate = new Date(nYear, nMonth, Math.min(targetDay, maxDayInNextMonth));
              monthCounter++;
          }
      }

      // 2. Çıkış İşlemlerini Hazırla
      const entryD = new Date(room.entryDate || Date.now()); 
      const exitD = new Date(endRentData.exitDate);
      const diffTime = Math.abs(exitD - entryD); 
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const months = Math.floor(diffDays / 30); 
      const durationStr = months > 0 ? `${months} Ay` : `${diffDays} Gün`;
      
      const historyRecord = { 
          id: Date.now(), 
          roomId: room.id || null,
          roomName: room.name || null,
          customerName: room.customerName || null, 
          entryDate: room.entryDate || null, 
          exitDate: endRentData.exitDate || null, 
          duration: durationStr, 
          monthlyFee: room.monthlyFee || null, 
          status: 'Çıkış Yaptı', 
          exitBy: endRentData.exitBy || 'kendisi',  // YENİ: çıkışı kim yaptı (kendisi / sembol)
          photo: endRentData.photo || null,        // Çıkış görseli
          exitPhoto: endRentData.photo || null,    // YENİ: çıkış fotoğrafı ayrı anahtarla da saklanır (oda görseli arşivi)
          entryPhoto: room.entryPhoto || null,     // Oda ilk giriş görseli
          roomListPhoto: room.roomListPhoto || null, // YENİ: oda görseli (liste görseli) de arşive kopyalanır
          tutanak: endRentData.tutanak || null,       // YENİ: çıkış sırasında yüklenen tutanak (imzalı belge / PDF)
          depoPhoto: endRentData.depoPhoto || null,   // YENİ: çıkış sırasında yüklenen güncel depo fotoğrafı
          entryExitHistory: room.entryExitHistory || null 
      };

      // YENİ: Müşterinin carisinde görünecek oda geçmişi kaydı (her oda ayrı ayrı listelenir)
      const customerRoomHistory = customerToUpdate ? [historyRecord, ...(customerToUpdate.roomHistory || [])] : null;

      const roomUpdates = {
          customerName: null, entryDate: null, paymentDate: null, monthlyFee: null, sealNo: null, broughtBy: 'kendisi', teamList: null, hasDamage: false, damageDescription: null, transportPrice: null, transportHasKdv: false, entryPhoto: null, entryPhotos: null, entryExitHistory: null, movedFrom: null, paidMonths: [], isFreeRoom: false, freeRoomReason: null, giftMonths: 0, 
          history: [historyRecord, ...(room.history || [])]
      };

      // Yerel state'i anında güncelle (önizleme + canlı): müşteri oda geçmişi görünür olsun
      if (customerToUpdate && customerRoomHistory) {
          setCustomers(prev => prev.map(c => String(c.id) === String(customerToUpdate.id) ? { ...c, roomHistory: customerRoomHistory } : c));
      }

      if (db && firebaseUser) {
          try {
              // Borçları Cariye İşle
              if (customerToUpdate && pendingDebtsToTransfer.length > 0) {
                  const existingDebts = customerToUpdate.extraDebts || [];
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), {
                      extraDebts: [...existingDebts, ...pendingDebtsToTransfer]
                  }, { merge: true });
              }
              // YENİ: Müşterinin oda geçmişini kaydet
              if (customerToUpdate && customerRoomHistory) {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), {
                      roomHistory: customerRoomHistory
                  }, { merge: true });
              }
              // Odayı Boşalt
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), roomUpdates, { merge: true });
          } catch(e) { console.error("Firebase Çıkış Yapma Hatası:", e); }
      }

      setIsEndRentModalOpen(false); 
      setEndRentData({ exitDate: new Date().toISOString().split('T')[0], photo: null, carrierName: '', carrierVkn: '', carrierAuthorized: '', exitBy: '' });
  };

  // YENİ EKLENEN: Çıkış SONRASI tutanak / depo fotoğrafı kaydeder.
  // 'Odadan Çıkış Yapma' yetkisi olan personel, tamamlanmış bir çıkış kaydına sonradan
  // belge ekleyebilsin diye kullanılır. Belgeler hem odanın geçmişine (history) hem de
  // müşterinin oda geçmişine (roomHistory) yazılır; canlı ortamda Firebase'e de işlenir.
  const handleSaveExitDocs = async () => {
      if (!exitDocsTarget) return;
      // Güvenlik: yalnızca yetkili personel kaydedebilir (yetkisi yoksa uyarı verir).
      if (!checkActionPerm('action-depodan-cikis')) return;

      const { index, historyId, tutanak, depoPhoto } = exitDocsTarget;
      const room = rooms.find(r => String(r.id) === String(selectedRoomId));
      if (!room) { setIsExitDocsModalOpen(false); setExitDocsTarget(null); return; }

      // 1) Odanın ilgili geçmiş kaydını güncelle (id varsa id ile, yoksa index ile eşleştir).
      const updatedHistory = (room.history || []).map((h, i) =>
          (historyId != null ? String(h.id) === String(historyId) : i === index)
              ? { ...h, tutanak: tutanak || null, depoPhoto: depoPhoto || null }
              : h
      );
      setRooms(prev => prev.map(r => String(r.id) === String(selectedRoomId) ? { ...r, history: updatedHistory } : r));

      // 2) Müşterinin oda geçmişini (roomHistory) de güncelle — kayıt id'si ile eşleştir.
      const cust = customers.find(c => c.name === exitDocsTarget.customerName);
      let updatedCustomerRoomHistory = null;
      if (cust) {
          updatedCustomerRoomHistory = (cust.roomHistory || []).map(h =>
              (historyId != null && String(h.id) === String(historyId))
                  ? { ...h, tutanak: tutanak || null, depoPhoto: depoPhoto || null }
                  : h
          );
          setCustomers(prev => prev.map(c => String(c.id) === String(cust.id) ? { ...c, roomHistory: updatedCustomerRoomHistory } : c));
      }

      // 3) Canlı ortamda Firebase'e yaz (önizlemede db null olduğu için bu blok atlanır).
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), { history: updatedHistory }, { merge: true });
              if (cust && updatedCustomerRoomHistory) {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(cust.id)), { roomHistory: updatedCustomerRoomHistory }, { merge: true });
              }
          } catch (e) { console.error("Firebase Çıkış Belgesi Kaydetme Hatası:", e); }
      }

      // İşlem kaydı (kullanıcı hareketleri)
      logActivity('Çıkış Belgesi Ekleme', `${exitDocsTarget.customerName || ''} - ${exitDocsTarget.roomName || ''} çıkış kaydına tutanak/depo fotoğrafı eklendi/güncellendi.`);
      setIsExitDocsModalOpen(false);
      setExitDocsTarget(null);
  };

const handleChangeRoomConfirm = async () => {
    if(!changeRoomTargetRoomId) return;
    const oldRoom = rooms.find(r => String(r.id) === String(selectedRoomId));
    const newRoom = rooms.find(r => String(r.id) === String(changeRoomTargetRoomId));
    if(!oldRoom || !newRoom) return;

    // YENİ: Kira modu — 'same' (aynı kira/cari aynen devam) | 'new' (yeni kira, eski oda kapanıyormuş gibi)
    const isNewFeeMode = changeRoomFeeMode === 'new';
    if (isNewFeeMode && (!changeRoomNewFee || Number(changeRoomNewFee) <= 0)) { alert('Lütfen KDV dahil yeni kira bedelini girin.'); return; }

    logActivity('Oda Değiştirme/Taşıma', `${oldRoom?.customerName || ''} için oda değişikliği/taşıma yapıldı (${isNewFeeMode ? 'Yeni Kira' : 'Aynı Kira'}).`);

    const entryD = new Date(oldRoom.entryDate || Date.now());
    const exitD = new Date();
    const diffTime = Math.abs(exitD - entryD);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const months = Math.floor(diffDays / 30);
    const durationStr = months > 0 ? `${months} Ay` : `${diffDays} Gün`;
    const customerToUpdate = customers.find(c => c.name === oldRoom.customerName);

    if (!isNewFeeMode) {
        // =========================================================
        // MOD 1: AYNI KİRA — eski odanın TÜM bilgileri (kira, giriş tarihi, cari borçlanma şekli)
        // aynen yeni odaya taşınır. Cari hiç kesintiye uğramamış gibi devam eder.
        // =========================================================
        const historyRecord = {
            id: Date.now(),
            roomId: oldRoom.id, roomName: oldRoom.name,
            customerName: oldRoom.customerName || null,
            entryDate: oldRoom.entryDate || null,
            exitDate: exitD.toLocaleDateString('tr-TR'),
            duration: durationStr,
            monthlyFee: oldRoom.monthlyFee || null,
            status: `${newRoom.name} Odasına Taşındı (Aynı Kira)`,
            photo: null, exitPhoto: null,
            entryPhoto: oldRoom.entryPhoto || null,
            entryPhotos: oldRoom.entryPhotos || [],
            roomListPhoto: oldRoom.roomListPhoto || null,
            entryExitHistory: oldRoom.entryExitHistory || null
        };
        const customerRoomHistory = customerToUpdate ? [historyRecord, ...(customerToUpdate.roomHistory || [])] : null;
        if (customerToUpdate && customerRoomHistory) {
            setCustomers(prev => prev.map(c => String(c.id) === String(customerToUpdate.id) ? { ...c, roomHistory: customerRoomHistory } : c));
        }

        if (db && firebaseUser) {
            try {
                // 1. Eski odayı boşalt ve geçmişe ekle
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(oldRoom.id)), {
                    customerName: null, entryDate: null, paymentDate: null, monthlyFee: null, sealNo: null,
                    broughtBy: 'kendisi', teamList: null, hasDamage: false, damageDescription: null, transportPrice: null, transportHasKdv: false, entryPhoto: null, entryPhotos: null, entryExitHistory: null, movedFrom: null,
                    paidMonths: [], isFreeRoom: false, freeRoomReason: null, giftMonths: 0,
                    history: [historyRecord, ...(oldRoom.history || [])]
                }, { merge: true });

                // 2. Yeni odaya müşterinin TÜM verilerini (kira dahil) birebir taşı
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(newRoom.id)), {
                    customerName: oldRoom.customerName || null,
                    entryDate: oldRoom.entryDate || null,
                    paymentDate: oldRoom.paymentDate || null,
                    monthlyFee: oldRoom.monthlyFee || null,
                    hasKdv: oldRoom.hasKdv !== undefined ? oldRoom.hasKdv : true,
                    sealNo: oldRoom.sealNo || null,
                    broughtBy: oldRoom.broughtBy || 'kendisi',
                    teamList: oldRoom.teamList || null,
                    hasDamage: oldRoom.hasDamage || false,
                    damageDescription: oldRoom.damageDescription || null,
                    transportPrice: oldRoom.transportPrice || null,
                    transportHasKdv: oldRoom.transportHasKdv || false,
                    entryPhoto: oldRoom.entryPhoto || null,
            entryPhotos: oldRoom.entryPhotos || [],
                    entryExitHistory: oldRoom.entryExitHistory || null,
                    paidMonths: oldRoom.paidMonths || [],
                    rentedBy: oldRoom.rentedBy || currentUserProfile.name,
                    movedFrom: oldRoom.name || null,
                    isReserved: false, reservedName: null, reservedPhone: null, reserveExpiry: null, reserveExpiryTimestamp: null,
                    isFreeRoom: oldRoom.isFreeRoom || false,
                    freeRoomReason: oldRoom.freeRoomReason || null,
                    giftMonths: oldRoom.giftMonths || 0,
                    increaseHistory: oldRoom.increaseHistory || null,
                    priceHistory: oldRoom.priceHistory || null
                }, { merge: true });

                // YENİ: Müşterinin oda geçmişini kaydet
                if (customerToUpdate && customerRoomHistory) {
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), { roomHistory: customerRoomHistory }, { merge: true });
                }
            } catch (e) { console.error("Firebase Oda Değiştirme Hatası (Aynı Kira):", e); }
        }
    } else {
        // =========================================================
        // MOD 2: YENİ KİRA — eski oda normal bir "çıkış" gibi kapanır (bugüne kadarki
        // ödenmemiş borç cariye kalıcı borç olarak işlenir), yeni odada SIFIRDAN bir kiralama
        // başlar: bugünün tarihi, kullanıcının girdiği YENİ (KDV dahil) kira, yeni sözleşme.
        // =========================================================
        const today = new Date(); today.setHours(23, 59, 59, 999);
        let pendingDebtsToTransfer = [];

        if (customerToUpdate) {
            const entryDate = parseDateLocal(oldRoom.entryDate || '2026-01-01');
            const paymentAnchorDate = oldRoom.paymentDate && oldRoom.paymentDate.includes('-') ? parseDateLocal(oldRoom.paymentDate) : entryDate;
            const baseAmt = Number(oldRoom.monthlyFee || 0);
            const hasKdvOld = oldRoom.hasKdv !== undefined ? oldRoom.hasKdv : true;
            const monthlyTotalOld = hasKdvOld ? baseAmt * 1.20 : baseAmt;
            const overrides = customerToUpdate.ledgerOverrides || [];

            let loopDate = new Date(paymentAnchorDate);
            while (loopDate <= today) {
                const key = `${loopDate.getFullYear()}-${loopDate.getMonth()}`;
                const txId = `debt-${oldRoom.id}-${key}`;
                let dueDate = new Date(loopDate.getFullYear(), loopDate.getMonth(), loopDate.getDate());
                dueDate.setHours(0, 0, 0, 0);
                const isDueYet = dueDate <= today;

                let currentMonthlyTotal = monthlyTotalOld;
                const override = overrides.find(o => o.txId === txId);
                if (override && !override.isDeleted && override.debt !== undefined) currentMonthlyTotal = override.debt;

                const monthIdx = Math.round((loopDate.getFullYear() * 12 + loopDate.getMonth()) - (paymentAnchorDate.getFullYear() * 12 + paymentAnchorDate.getMonth()));
                const isGifted = isGiftedMonth(oldRoom, monthIdx);
                const isFree = oldRoom.isFreeRoom;

                if (isDueYet && !oldRoom.paidMonths?.includes(key) && !isGifted && !isFree) {
                    pendingDebtsToTransfer.push({
                        id: Date.now() + Math.random(),
                        type: 'manual_debt',
                        date: new Date(loopDate).toISOString().split('T')[0],
                        amount: currentMonthlyTotal,
                        hasKdv: false,
                        desc: `${oldRoom.name} Odası Eski Kira Borcu (Oda Değişikliği)`
                    });
                }
                const targetDay = oldRoom.paymentDate && !oldRoom.paymentDate.includes('-') ? parseInt(oldRoom.paymentDate) : paymentAnchorDate.getDate();
                let nMonth = loopDate.getMonth() + 1; let nYear = loopDate.getFullYear();
                if (nMonth > 11) { nMonth = 0; nYear++; }
                let maxDayInNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
                loopDate = new Date(nYear, nMonth, Math.min(targetDay, maxDayInNextMonth));
            }
        }

        const historyRecord = {
            id: Date.now(),
            roomId: oldRoom.id, roomName: oldRoom.name,
            customerName: oldRoom.customerName || null,
            entryDate: oldRoom.entryDate || null,
            exitDate: exitD.toLocaleDateString('tr-TR'),
            duration: durationStr,
            monthlyFee: oldRoom.monthlyFee || null,
            status: `Çıkış Yaptı (${newRoom.name} Odasına Yeni Kira İle Geçti)`,
            photo: null, exitPhoto: null,
            entryPhoto: oldRoom.entryPhoto || null,
            entryPhotos: oldRoom.entryPhotos || [],
            roomListPhoto: oldRoom.roomListPhoto || null,
            entryExitHistory: oldRoom.entryExitHistory || null
        };
        const customerRoomHistory = customerToUpdate ? [historyRecord, ...(customerToUpdate.roomHistory || [])] : null;

        // Yeni kira: girilen tutar HER ZAMAN KDV DAHİL kabul edilir; taban (KDV hariç) tutar hesaplanır.
        const newFeeTotal = Number(changeRoomNewFee);
        const newFeeBase = Math.round((newFeeTotal / 1.20) * 100) / 100;
        const todayISO = today.toISOString().split('T')[0];

        // Yerel state'i anında güncelle
        if (customerToUpdate) {
            const existingDebts = customerToUpdate.extraDebts || [];
            setCustomers(prev => prev.map(c => String(c.id) === String(customerToUpdate.id) ? {
                ...c,
                extraDebts: pendingDebtsToTransfer.length > 0 ? [...existingDebts, ...pendingDebtsToTransfer] : existingDebts,
                roomHistory: customerRoomHistory || c.roomHistory
            } : c));
        }

        if (db && firebaseUser) {
            try {
                // 1. Eski borcu cariye kalıcı borç olarak işle + oda geçmişini kaydet
                if (customerToUpdate) {
                    const existingDebts = customerToUpdate.extraDebts || [];
                    const payload = {};
                    if (pendingDebtsToTransfer.length > 0) payload.extraDebts = [...existingDebts, ...pendingDebtsToTransfer];
                    if (customerRoomHistory) payload.roomHistory = customerRoomHistory;
                    if (Object.keys(payload).length > 0) {
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), payload, { merge: true });
                    }
                }

                // 2. Eski odayı tamamen boşalt (normal çıkış gibi)
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(oldRoom.id)), {
                    customerName: null, entryDate: null, paymentDate: null, monthlyFee: null, sealNo: null,
                    broughtBy: 'kendisi', teamList: null, hasDamage: false, damageDescription: null, transportPrice: null, transportHasKdv: false, entryPhoto: null, entryPhotos: null, entryExitHistory: null, movedFrom: null,
                    paidMonths: [], isFreeRoom: false, freeRoomReason: null, giftMonths: 0,
                    history: [historyRecord, ...(oldRoom.history || [])]
                }, { merge: true });

                // 3. Yeni odada SIFIRDAN bir kiralama başlat (yeni tarih, yeni kira, hediye ay yok)
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(newRoom.id)), {
                    customerName: oldRoom.customerName || null,
                    entryDate: todayISO,
                    paymentDate: todayISO,
                    monthlyFee: newFeeBase,
                    hasKdv: true,
                    sealNo: oldRoom.sealNo || null,
                    broughtBy: 'kendisi',
                    teamList: null,
                    hasDamage: false, damageDescription: null,
                    transportPrice: null, transportHasKdv: false,
                    entryPhoto: null, entryPhotos: null, entryExitHistory: null,
                    paidMonths: [],
                    rentedBy: currentUserProfile.name,
                    movedFrom: oldRoom.name || null,
                    isReserved: false, reservedName: null, reservedPhone: null, reserveExpiry: null, reserveExpiryTimestamp: null,
                    isFreeRoom: false, freeRoomReason: null,
                    giftMonths: 0, giftStartMonthIndex: 0,
                    increaseHistory: null, priceHistory: null
                }, { merge: true });

                // 4. YENİ Sözleşmeyi üret ve cariye arşivle
                try {
                    const dateStr = today.toLocaleDateString('tr-TR');
                    const contractHtml = buildDepoevimContractHtml({
                        mAd: customerToUpdate?.name || oldRoom.customerName || '',
                        mTc: customerToUpdate?.tc || '',
                        mTel: customerToUpdate?.phone || '',
                        mTel2: customerToUpdate?.altPhone || customerToUpdate?.phone2 || '',  // DÜZELTİLDİ: yedek numara "altPhone" alanından okunur
                        mAdres: customerToUpdate?.address || '',
                        odaNo: newRoom.name || '',
                        dateStr,
                        kdvIncl: Math.round(newFeeTotal),
                        depoAdres: getRoomWarehouseAddress(newRoom)
                    });
                    if (customerToUpdate) {
                        // HTML içerik, arşiv görüntüleyicide (openArchiveFile) açılabilmesi için data:text/html URL'sine çevrilir
                        const htmlDataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(contractHtml);
                        const contractRecord = { id: Date.now() + 1, label: `Sözleşme (${newRoom.name} - Oda Değişikliği)`, date: today.toISOString().split('T')[0], file: htmlDataUrl, note: 'Oda değişikliği ile yenilenen sözleşme' };
                        await saveContractToCustomer(customerToUpdate.id, contractRecord);
                    }
                } catch (ce) { console.error('Yeni sözleşme üretme hatası:', ce); }

            } catch (e) { console.error("Firebase Oda Değiştirme Hatası (Yeni Kira):", e); }
        }
    }

    setIsChangeRoomModalOpen(false);
    setChangeRoomWarehouseId('');
    setChangeRoomBlockId('');
    setChangeRoomTargetRoomId('');
    setChangeRoomFeeMode('same');
    setChangeRoomNewFee('');

    const targetBlock = blocks.find(b => b.id === newRoom.blockId);
    if (targetBlock) {
        setSelectedWarehouseId(targetBlock.warehouseId);
        setSelectedBlockId(newRoom.blockId);
        setSelectedRoomId(newRoom.id);
    }
  };

  // YENİ EKLENEN: Bir odanın belirli bir yıl-ay için geçerli baz kirasını döndürür.
  // increaseHistory varsa o aya (veya öncesine) ait en güncel kaydı, yoksa odanın monthlyFee'sini verir.
  const getRoomFeeForMonth = (room, year, month) => {
      let effective = Number(room.monthlyFee || 0);
      if (Array.isArray(room.increaseHistory) && room.increaseHistory.length > 0) {
          const targetIdx = year * 12 + month;
          // ═══════════════════════════════════════════════════════════════════
          // DÜZELTİLDİ: ZAM ARTIK GEÇMİŞ AYLARI ETKİLEMİYOR
          // ESKİ HATA: Hesap "effective = room.monthlyFee" (yani ZAMLI GÜNCEL kira)
          // ile başlayıp o aya kadar geçerli kayıtların EN YÜKSEĞİNİ alıyordu.
          // Başlangıç değeri güncel kira olduğu için hiçbir eski kira onu geçemiyor
          // ve 2023/2024 gibi GEÇMİŞ aylar da yeni zamlı tutarla hesaplanıyordu.
          // (Sonradan KDV'li yapılan odalarda bu, geçmiş cariyi tamamen bozuyordu.)
          //
          // YENİ MANTIK — "kira geçmişte düşmez" kuralı korunarak:
          //   1) Zam kayıtları etkin aya göre KRONOLOJİK sıralanır.
          //   2) Kayıtlar üzerinde yürüyen maksimum (running max) uygulanır; böylece
          //      yanlışlıkla düşük girilmiş bir kayıt önceki doğru kirayı EZEMEZ.
          //   3) İstenen ay için, o aya kadar YÜRÜRLÜĞE GİRMİŞ EN SON kayıt seçilir —
          //      sonraki zamlar geçmişe SIZMAZ.
          //   4) İstenen ay ilk kayıttan da eskiyse, EN ESKİ kayıt (orijinal kira) kullanılır;
          //      artık güncel zamlı kiraya düşülmez.
          // ═══════════════════════════════════════════════════════════════════
          const norm = room.increaseHistory
              .map(h => {
                  const parts = String(h.effectiveKey).split('-');
                  return { idx: parseInt(parts[0]) * 12 + parseInt(parts[1]), fee: Number(h.baseFee) };
              })
              .filter(x => !isNaN(x.idx) && !isNaN(x.fee) && x.fee > 0)
              .sort((a, b) => a.idx - b.idx);

          if (norm.length > 0) {
              // Yürüyen maksimum: kira zaman içinde asla düşmez
              let run = 0;
              norm.forEach(x => { run = Math.max(run, x.fee); x.fee = run; });
              // O aya kadar yürürlüğe girmiş EN SON kayıt
              const applicable = norm.filter(x => x.idx <= targetIdx);
              effective = applicable.length > 0
                  ? applicable[applicable.length - 1].fee   // geçerli dönemin kirası
                  : norm[0].fee;                            // ilk kayıttan önceki aylar → orijinal kira
          }
      }
      return effective;
  };

  // YENİ: Odanın EN SON / EN YÜKSEK geçerli kirasını (KDV HARİÇ baz tutar) döndürür.
  // Kaynakların tamamına bakar ve en yükseğini seçer:
  //   1) room.monthlyFee (kayıtlı aylık kira)
  //   2) increaseHistory (bugüne kadar yürürlüğe girmiş zamlar)
  //   3) priceHistory (zam geçmişindeki son kayıtlar — "Geçmiş Zamları Düzenle" buraya yazar)
  //   4) Müşteri carisindeki bu odaya ait borç override kayıtları (Geçmiş Zamlı Kira satırları)
  // Böylece cariye yansımış zamlı kira, "Mevcut Kira" ve "Aylık Kira Bedeli" alanlarında da görünür.
  const getRoomLatestFee = (room) => {
      const now = new Date();
      let best = Math.max(Number(room.monthlyFee || 0), Number(getRoomFeeForMonth(room, now.getFullYear(), now.getMonth()) || 0));

      // priceHistory içindeki sayısal newFee değerlerinin en yükseği
      if (Array.isArray(room.priceHistory)) {
          room.priceHistory.forEach(ph => {
              const f = Number(ph.newFee);
              if (!isNaN(f) && f > 0) best = Math.max(best, f);
          });
      }

      // Müşteri carisindeki bu odaya ait override'lar (hediye/silinmiş kayıtlar hariç)
      const cust = customers.find(c => c.name === room.customerName);
      const roomOverrides = (cust?.ledgerOverrides || []).filter(o =>
          !o.isDeleted && !o.isSpecificGift &&
          String(o.txId || '').startsWith(`debt-${room.id}-`) &&
          o.baseDebt !== undefined
      );
      roomOverrides.forEach(o => {
          const f = Number(o.baseDebt);
          if (!isNaN(f) && f > 0) best = Math.max(best, f);
      });

      return best;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // YENİ EKLENEN: SONRADAN "KDV'Lİ YAP" İLE ÇEVRİLEN ODALARDA MEVCUT KİRA DÜZELTMESİ
  //
  // SORUN: handleConvertCustomerToKdv, odayı çevirirken monthlyFee'yi BİLEREK
  // değiştirmez; cari hesap (getCustomerLedger) geçiş ayından itibaren bu tutarı
  // "KDV DAHİL" kabul edip KDV'yi İÇİNDEN ayrıştırır (isConvertedKdvMonth bloğu).
  // Yani bu odalarda saklanan tutar ZATEN BRÜT'tür. Ekranlarda ise tutar
  // "hasKdv ? tutar * 1.20" ile gösterildiği için %20 FAZLA görünüyordu
  // (ör. gerçek 5.500 TL yerine 6.600 TL). Bu yüzden hata SADECE sonradan
  // KDV'li yapılan odalarda oluşuyordu.
  //
  // ÇÖZÜM: Aşağıdaki iki yardımcı, tutarın hangi ölçekte (net mi brüt mü)
  // saklandığını tespit eder ve KDV DAHİL doğru tutarı döndürür.
  // ═══════════════════════════════════════════════════════════════════════════

  // Odanın saklanan kira tutarı BRÜT (KDV dahil) ölçekte mi tutuluyor?
  // kdvStartKey SADECE "Carisini KDV'li Yap" ile çevrilen odalarda oluşur ve bu işlem
  // monthlyFee'yi DEĞİŞTİRMEZ — yani tutar, KDV'siz dönemden kalan BRÜT tutardır.
  // (Geçiş ayından önceki aylarda KDV'siz, sonrasında KDV içeriden ayrıştırılarak
  //  işlendiği için tutar HER İKİ dönemde de aynı brüt rakamdır.)
  const isRoomKdvStoredGross = (room) => !!(room && room.kdvStartKey);

  // Odanın EN SON / GÜNCEL "KDV DAHİL" kirası — ekranlarda gösterilecek doğru tutar.
  const getRoomLatestGrossFee = (room) => {
      const stored = Number(getRoomLatestFee(room) || 0);
      // Sonradan çevrilen odada saklanan tutar ZATEN KDV dahil → tekrar ×1.20 YAPILMAZ.
      if (isRoomKdvStoredGross(room)) return Math.round(stored);
      const mult = (room.hasKdv !== undefined ? room.hasKdv : true) ? 1.20 : 1;
      return Math.round(stored * mult);
  };

  const handleOpenApplyIncreaseModal = (room, year) => {
      // GÜNCELLENDİ: Zam baz kirası, listede gösterilen "MEVCUT KIRA" ile birebir aynı olsun diye
      // getRoomLatestFee(room) kullanılır (en güncel/geçerli kira). Böylece zam, ekranda görülen
      // mevcut kira üzerinden yapılır ve tutarsızlık olmaz.
      const netBase = Math.max(Number(getRoomLatestFee(room) || 0), Number(room.monthlyFee || 0));
      // GÜNCELLENDİ: Zam artık KDV DAHİL kira üzerinden yapılır. Baz kira ve girilen yeni tutar KDV dahildir.
      // (KDV muaf odalarda çarpan 1'dir; muafiyet korunur.) Kaydederken net'e çevrilecek.
      // YENİ: Sonradan KDV'li yapılan odalarda saklanan tutar ZATEN brüt olduğu için çarpan 1'dir;
      // aksi halde zam bazı %20 şişer. Baz kira listedeki "Mevcut Kira" ile birebir aynı olur.
      const _isConvKdv = isRoomKdvStoredGross(room);
      const kdvMult = _isConvKdv ? 1 : ((room.hasKdv !== undefined ? room.hasKdv : true) ? 1.20 : 1);
      const base = getRoomLatestGrossFee(room); // KDV dahil baz kira (listedeki "Mevcut Kira" ile birebir aynı)

      const rate = Number(collectionRates.roomIncreaseRate || 50);
      const defaultNew = Math.round(base + (base * rate / 100));

      // increaseModalData'ya KDV dahil baz kirayı ve çarpanı ekliyoruz (kaydederken net'e çevirmek için)
      // isConvertedKdv: kaydetme aşamasında KDV ayrıştırmasının doğru yapılması için taşınır
      setIncreaseModalData({ ...room, targetYear: parseInt(year), increaseBaseFee: base, kdvMult, isConvertedKdv: _isConvKdv });
      setIncreaseMode('percentage');
      setIncreasePercentage(rate.toString());
      setNewRentAmount(defaultNew.toString());
      setIsApplyIncreaseModalOpen(true);
  };

  const handlePercentageInput = (val) => {
      setIncreasePercentage(val);
      // YENİ: Baz olarak bir önceki ayın geçerli kirası (increaseBaseFee) kullanılır
      const base = Number(increaseModalData?.increaseBaseFee ?? increaseModalData?.monthlyFee ?? 0);
      setNewRentAmount(Math.round(base + (base * Number(val) / 100)).toString());
  };

  const handleAmountInput = (val) => {
      setNewRentAmount(val);
      const base = Number(increaseModalData?.increaseBaseFee ?? increaseModalData?.monthlyFee ?? 0);
      const perc = base > 0 ? ((Number(val) - base) / base * 100).toFixed(1) : 0;
      setIncreasePercentage(perc.toString());
  };

  const handleConfirmIncrease = async () => {
      if (!increaseModalData || !newRentAmount) return;

      const room = increaseModalData;
      // GÜNCELLENDİ: Modal KDV DAHİL çalışır. Girilen tutar KDV dahildir; sistemde saklanan
      // monthlyFee/baz NET (KDV hariç) olduğundan, çarpana bölerek net'e çeviriyoruz.
      // YENİ: Sonradan KDV'li yapılan odalarda monthlyFee BRÜT saklanır (cari içeriden KDV ayrıştırır),
      // bu yüzden çarpan 1'dir. Diğer odalarda eski davranış (net saklama) aynen korunur.
      const kdvMult = increaseModalData.isConvertedKdv ? 1 : (Number(increaseModalData.kdvMult) || ((increaseModalData.hasKdv !== undefined ? increaseModalData.hasKdv : true) ? 1.20 : 1));
      const enteredGross = Number(newRentAmount);                                              // kullanıcının girdiği KDV dahil tutar
      const grossOld = Number(increaseModalData.increaseBaseFee ?? increaseModalData.monthlyFee); // KDV dahil baz kira
      const newFee = enteredGross / kdvMult;   // NET yeni kira (monthlyFee olarak saklanır; ×KDV = girilen tutar)
      const oldFee = grossOld / kdvMult;        // NET eski (baz) kira
      const percentage = Number(increasePercentage);

      // DÜZELTME: Zam kirayı DÜŞÜREMEZ. Girilen yeni tutar, mevcut/en yüksek geçerli kiradan düşükse
      // (ör. yanlışlıkla 500 TL girilmesi) işlem durdurulur; böylece geçmiş cari bozulmaz.
      const _curLatestNet = Number(getRoomLatestFee(room) || 0);
      if (newFee > 0 && newFee < _curLatestNet - 0.5) {
          const _mult = kdvMult;
          alert(`⚠️ Girilen yeni kira (${Math.round(newFee * _mult).toLocaleString('tr-TR')} TL) mevcut kiradan (${Math.round(_curLatestNet * _mult).toLocaleString('tr-TR')} TL) DÜŞÜK.\n\nZam işlemi kirayı düşüremez. Lütfen mevcut kiradan yüksek bir tutar girin.\n(Kirayı düşürmek istiyorsanız "Geçmiş Zamları Düzenle" bölümünü kullanın.)`);
          return;
      }

      const historyEntry = {
          id: Date.now(),
          date: new Date().toLocaleDateString('tr-TR'),
          oldFee: oldFee,
          newFee: newFee,
          percentage: percentage,
          anniversaryYear: increaseModalData.targetYear,
          yearsPassed: increaseModalData.yearsPassed
      };

      // YENİ EKLENEN: Zam, giriş ayına denk gelen ay itibarıyla (targetYear yılında) geçerli olur.
      // Örn. 06.07.2025 giren müşteri için 2026 zammı → Temmuz 2026 ve sonrası yeni kira; öncesi eski kira.
      const entryD = parseDateLocal(room.entryDate || '2026-01-01');
      const anchorD = room.paymentDate && room.paymentDate.includes('-') ? parseDateLocal(room.paymentDate) : entryD;
      const effectiveMonth = anchorD.getMonth();
      // DÜZELTME: Zam ASLA GEÇMİŞE uygulanmaz. Seçilen yıl geçmişteyse (ör. 2022) veya hesaplanan
      // geçerlilik ayı bugünden önceyse, zam içinde bulunulan aya çekilir. Böylece zam yaptıktan sonra
      // GEÇMİŞ cari (önceki ayların kira/borç kayıtları) HİÇ değişmez; yalnızca bugün ve sonrası etkilenir.
      const _now = new Date();
      let _effIdx = Number(increaseModalData.targetYear) * 12 + effectiveMonth;
      const _nowIdx = _now.getFullYear() * 12 + _now.getMonth();
      if (_effIdx < _nowIdx) _effIdx = _nowIdx;
      const _effYear = Math.floor(_effIdx / 12);
      const _effMon = _effIdx % 12;
      const effectiveKey = `${_effYear}-${_effMon}`;

      // ═══════════════════════════════════════════════════════════════════════
      // DÜZELTİLDİ: GEÇMİŞ ZAM DÖNEMLERİ ARTIK DOĞRU KURULUYOR
      // ESKİ HATA: increaseHistory boşsa SADECE tek bir başlangıç kaydı yazılıyordu
      // ve bu kayda "oldFee" (yani SON zamdan hemen önceki kira) konuyordu. Oda
      // yıllardır kiradaysa (ör. 2023 girişli, her yıl zamlı) bu tek kayıt
      // 2023'ten itibaren TÜM geçmişi son kiraya eşitliyordu — 2023 ekstresinde
      // 2026 kirası görünmesinin sebebi buydu.
      // ÇÖZÜM: Oda zaten "priceHistory" içinde her zammın oldFee/newFee/yıl
      // bilgisini tutuyor. Bu kayıtlardan dönem dönem geçmiş yeniden kurulur:
      //   • Orijinal kira  = EN ESKİ zammın oldFee'si → giriş ayından itibaren geçerli
      //   • Her zam        = kendi yıldönümü ayından itibaren geçerli
      // Böylece her ay kendi döneminin kirasıyla hesaplanır, geçmiş bozulmaz.
      // NOT: "Geçmiş Zam" (manuel düzenleme) kayıtları sayısal oldFee içermediği
      // için bu kurguya dahil edilmez; onlar ayrı override kayıtlarıyla çalışır.
      // ═══════════════════════════════════════════════════════════════════════
      let baseHistory = Array.isArray(room.increaseHistory) ? [...room.increaseHistory] : [];
      const _anchorY = anchorD.getFullYear();
      const _anchorM = anchorD.getMonth();
      const _hasKey = (k) => baseHistory.some(h => String(h.effectiveKey) === k);

      // priceHistory'den yalnızca gerçek (otomatik) zam kayıtlarını al
      const _realPast = (Array.isArray(room.priceHistory) ? room.priceHistory : []).filter(p =>
          p && p.anniversaryYear && !isNaN(Number(p.newFee)) && Number(p.newFee) > 0 &&
          !isNaN(Number(p.oldFee)) && Number(p.oldFee) > 0 && p.percentage !== 'Geçmiş Zam'
      ).sort((a, b) => Number(a.anniversaryYear) - Number(b.anniversaryYear));

      if (_realPast.length > 0) {
          // 1) Orijinal kira → giriş/ödeme ayından itibaren
          const _origFee = Number(_realPast[0].oldFee);
          const _origKey = `${_anchorY}-${_anchorM}`;
          if (!_hasKey(_origKey)) baseHistory.push({ effectiveKey: _origKey, baseFee: _origFee });
          // 2) Her geçmiş zam → kendi yıldönümü ayından itibaren
          _realPast.forEach(p => {
              const k = `${Number(p.anniversaryYear)}-${_anchorM}`;
              if (!_hasKey(k)) baseHistory.push({ effectiveKey: k, baseFee: Number(p.newFee) });
          });
      }

      // Hiç geçmiş bilgisi yoksa (ilk zam): giriş ayından itibaren eski kira geçerli sayılır
      if (baseHistory.length === 0) {
          baseHistory.push({ effectiveKey: `${_anchorY}-${_anchorM}`, baseFee: oldFee });
      }
      // Aynı etkin ay varsa güncelle, yoksa ekle
      const newIncreaseHistory = [...baseHistory.filter(h => h.effectiveKey !== effectiveKey), { effectiveKey, baseFee: newFee }];

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(increaseModalData.id)), {
                  monthlyFee: newFee,
                  increaseHistory: newIncreaseHistory,
                  priceHistory: [...(increaseModalData.priceHistory || []), historyEntry]
              }, { merge: true });
          } catch(e) { console.error("Firebase Zam Kayıt Hatası:", e); }
      } else {
          // Önizleme modu: yerel state güncelle
          setRooms(prev => prev.map(r => r.id === increaseModalData.id
              ? { ...r, monthlyFee: newFee, increaseHistory: newIncreaseHistory, priceHistory: [...(r.priceHistory || []), historyEntry] }
              : r
          ));
      }

      // ═══════════════════════════════════════════════════════════════════
      // YENİ EKLENEN: ZAM SONRASI CARİ GÜNCELLEME (mevcut kodlara dokunulmadı)
      // Zam yapıldıktan sonra, müşterinin carisinde ZAM YAPILAN AYIN (etkin ay)
      // oda borcu da yeni zamlı kiraya göre ANINDA güncellenir.
      //  • Zam ayı ve SONRASINA ait bu odanın eski borç override kayıtları
      //    (örn. "Geçmiş Zamlı Kira" satırları) temizlenir — eski/düşük tutar
      //    zamlı kirayı artık ezemez. Zam ayından ÖNCEKİ tüm cari aynen korunur.
      //  • Hediye / 0 TL kayıtlarına kesinlikle dokunulmaz.
      //  • Zam ayına, KDV DAHİL yeni kira tutarıyla tek bir override yazılır;
      //    böylece cari ekstrede o ayın oda borcu zamlı tutarla görünür
      //    (KDV dönüşümlü odalardaki net/brüt karışıklığı da bu sayede çözülür).
      //  • Ay sonu güvenliği: ödeme günü (29/30/31) o ayda yoksa ayın son
      //    gününe çekilir — Şubat gibi kısa aylar asla atlanmaz.
      // ═══════════════════════════════════════════════════════════════════
      const zamCustomer = customers.find(c => c.name === room.customerName);
      if (zamCustomer) {
          const grossNew = Math.round(newFee * kdvMult * 100) / 100;   // KDV dahil yeni kira (modalde girilen tutar)
          // YENİ: Sonradan KDV'li yapılan odada tutar brüt saklandığı için net/KDV, tutarın İÇİNDEN ayrıştırılır.
          const _netForSplit = increaseModalData.isConvertedKdv ? (Math.round((grossNew / 1.20) * 100) / 100) : newFee;
          const kdvNew = Math.round((grossNew - _netForSplit) * 100) / 100;  // KDV tutarı (KDV muaf odada 0 çıkar)
          const ovPrefix = `debt-${room.id}-`;

          // Zam ayı ve sonrasındaki bu odaya ait ESKİ borç override'larını ayıkla
          const keptOverrides = (zamCustomer.ledgerOverrides || []).filter(o => {
              if (!o || !String(o.txId || '').startsWith(ovPrefix)) return true;          // başka oda/kayıtlar aynen kalır
              if (o.isSpecificGift === true || (Number(o.debt) || 0) === 0) return true;  // hediye/0 TL kayıtları korunur
              const p = String(o.txId).slice(ovPrefix.length).split('-');
              const oIdx = parseInt(p[0]) * 12 + parseInt(p[1]);
              return oIdx < _effIdx; // zam ayından ÖNCEKİ kayıtlar (geçmiş cari) aynen korunur
          });

          // Zam ayının ödeme gününü hesapla — ay sonu (28/29/30/31) validasyonlu
          const zamMonthLastDay = new Date(_effYear, _effMon + 1, 0).getDate();
          const zamPayDay = Math.min(anchorD.getDate(), zamMonthLastDay);
          const zamMonthsStr = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

          // ═══════════════════════════════════════════════════════════════════
          // YENİ EKLENEN — KESİN ÇÖZÜM: GEÇMİŞ AYLARI ZAM ANINDA KİLİTLE
          // SORUN: Zam sonrası geçmiş ayların kirası değişiyordu. Sebebi, geçmiş
          // ayların her ekran açılışında YENİDEN HESAPLANMASI; hesaplama odanın
          // güncel (zamlı) kirasına ve güncel KDV durumuna bakınca, "sonradan
          // KDV'li yapılan" odalarda ilk yılların kirası da yükseliyordu.
          // (Örn: 2022'de 500 TL olan T-103, zam sonrası 2.750 TL görünüyordu.)
          //
          // ÇÖZÜM: Zam UYGULANIRKEN, zam ayından ÖNCEKİ her ay için o ayın
          // ZAM ÖNCESİ tutarı hesaplanıp cariye SABİT kayıt (override) olarak
          // yazılır. Böylece geçmiş, hesaplamaya bağımlı olmaktan çıkar ve
          // ileride ne olursa olsun DEĞİŞMEZ — mühürlenmiş olur.
          // Kurallar:
          //   • Zaten elle düzenlenmiş aylara DOKUNULMAZ (kullanıcı kaydı korunur).
          //   • Hediye / ücretsiz aylar atlanır (0 TL kalır).
          //   • Her ayın KDV durumu kendi dönemine göre yazılır (kdvStartKey).
          //   • Ödeme günü o ayda yoksa ayın son gününe çekilir (28/29/30/31 güvenliği).
          // ═══════════════════════════════════════════════════════════════════
          const pastSnapshots = [];
          const _snapEntryD = parseDateLocal(room.entryDate || '2026-01-01');
          const _snapAnchor = room.paymentDate && room.paymentDate.includes('-') ? parseDateLocal(room.paymentDate) : _snapEntryD;
          const _snapTargetDay = room.paymentDate && !room.paymentDate.includes('-') ? parseInt(room.paymentDate) : _snapAnchor.getDate();
          const _snapStartIdx = _snapAnchor.getFullYear() * 12 + _snapAnchor.getMonth();
          let _sy = _snapAnchor.getFullYear(), _sm = _snapAnchor.getMonth(), _guard = 0;

          while ((_sy * 12 + _sm) < _effIdx && _guard < 600) {
              const _sKey = `${_sy}-${_sm}`;
              const _sTxId = `${ovPrefix}${_sKey}`;
              const _alreadySet = keptOverrides.some(o => o && o.txId === _sTxId);
              const _monthCounter = (_sy * 12 + _sm) - _snapStartIdx;
              const _isGiftOrFree = isGiftedMonth(room, _monthCounter) || room.isFreeRoom;

              if (!_alreadySet && !_isGiftOrFree) {
                  // ZAM ÖNCESİ oda nesnesi (room) ile o ayın kirası → geçmiş aynen korunur
                  const _fee = getRoomFeeForMonth(room, _sy, _sm);
                  // O ayın KDV durumu: sonradan KDV'li yapıldıysa geçiş ayından itibaren geçerli
                  let _mHasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
                  let _mConverted = false;
                  if (room.kdvStartKey) {
                      const _sp = String(room.kdvStartKey).split('-');
                      const _onward = (_sy > parseInt(_sp[0])) || (_sy === parseInt(_sp[0]) && _sm >= parseInt(_sp[1]));
                      _mHasKdv = _onward;
                      _mConverted = _onward;
                  }
                  let _tot, _base, _kdv;
                  if (_mConverted) {
                      // Dönüşüm sonrası: tutar KDV DAHİL kabul edilir, KDV içeriden ayrıştırılır
                      _tot = _fee;
                      _base = Math.round((_fee / 1.20) * 100) / 100;
                      _kdv = Math.round((_fee - _base) * 100) / 100;
                  } else {
                      _tot = _mHasKdv ? Math.round(_fee * 1.20 * 100) / 100 : _fee;
                      _base = _fee;
                      _kdv = _mHasKdv ? Math.round(_fee * 0.20 * 100) / 100 : 0;
                  }
                  const _lastDay = new Date(_sy, _sm + 1, 0).getDate();
                  const _payDay = Math.min(_snapTargetDay, _lastDay);
                  pastSnapshots.push({
                      txId: _sTxId,
                      date: new Date(_sy, _sm, _payDay).getTime(),
                      desc: `${room.name} Odası - ${zamMonthsStr[_sm]} ${_sy} Kirası`,
                      debt: _tot,
                      baseDebt: _base,
                      kdvDebt: _kdv,
                      credit: 0,
                      frozenByIncrease: true   // bu kaydın zam anında mühürlendiğini belirtir
                  });
              }
              _sm++; if (_sm > 11) { _sm = 0; _sy++; }
              _guard++;
          }

          // Zam ayına yeni (zamlı) tutarlı borç override'ı ekle
          const zamOverride = {
              txId: `${ovPrefix}${effectiveKey}`,
              date: new Date(_effYear, _effMon, zamPayDay).getTime(),
              desc: `${room.name} Odası - ${zamMonthsStr[_effMon]} ${_effYear} Kirası (Zamlı)`,
              debt: grossNew,        // KDV dahil toplam borç
              baseDebt: _netForSplit, // NET (KDV hariç) kira
              kdvDebt: kdvNew,     // KDV tutarı
              credit: 0
          };
          // GÜNCELLENDİ: Artık kilitlenen geçmiş aylar (pastSnapshots) da cariye yazılır.
          // Sıra önemlidir: mevcut kayıtlar → mühürlenen geçmiş aylar → zam ayının yeni kaydı.
          const _snapIds = new Set(pastSnapshots.map(s => s.txId));
          const updatedOverrides = [
              ...keptOverrides.filter(o => o.txId !== zamOverride.txId && !_snapIds.has(o.txId)),
              ...pastSnapshots,
              zamOverride
          ];

          if (db && firebaseUser) {
              try {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(zamCustomer.id)), {
                      ledgerOverrides: updatedOverrides
                  }, { merge: true });
              } catch (e) { console.error('Firebase Zam Cari Güncelleme Hatası:', e); }
          } else {
              // Önizleme modu: müşteri carisini yerel state üzerinden güncelle
              setCustomers(prev => prev.map(c => c.id === zamCustomer.id
                  ? { ...c, ledgerOverrides: updatedOverrides }
                  : c
              ));
          }
      }

      setIsApplyIncreaseModalOpen(false);
      setIncreaseModalData(null);
  };

const handleSavePastIncrease = async () => {
      if (!pastIncreaseData.date || !pastIncreaseData.amount) return;
      
const startDate = new Date(pastIncreaseData.date);
      const amountInput = Number(pastIncreaseData.amount);
      const hasKdv = selectedRoomDetail.hasKdv !== false;
      
      let monthlyTotal, amount;
      if (pastIncreaseData.isKdvIncluded && hasKdv) {
          monthlyTotal = amountInput;
          amount = amountInput / 1.20; // KDV hariç hali
      } else {
          amount = amountInput;
          monthlyTotal = hasKdv ? amount * 1.20 : amount;
      }

      const newOverrides = [];
      let loopDate = new Date(startDate);
      // 12 ay (1 yıl) boyunca üstüne yazma kuralı ekle
      for(let i = 0; i < 12; i++) {
          const key = `${loopDate.getFullYear()}-${loopDate.getMonth()}`;
          const txId = `debt-${selectedRoomId}-${key}`;
          const monthName = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][loopDate.getMonth()];
newOverrides.push({
              txId, 
              date: new Date(loopDate).getTime(), // Firebase timestamp uyumluluğu
              desc: `${selectedRoomDetail.name} Odası - Geçmiş Zamlı Kira (${monthName} ${loopDate.getFullYear()})`,
              debt: monthlyTotal, 
              baseDebt: amount, 
              kdvDebt: hasKdv ? amount * 0.20 : 0, 
              credit: 0
          });
          
          const targetDay = startDate.getDate();
          let nMonth = loopDate.getMonth() + 1;
          let nYear = loopDate.getFullYear();
          if (nMonth > 11) { nMonth = 0; nYear++; }
          let maxDayInNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
          loopDate = new Date(nYear, nMonth, Math.min(targetDay, maxDayInNextMonth));
      }

      const customerToUpdate = customers.find(c => c.name === selectedRoomDetail.customerName);
      
      if (db && firebaseUser) {
          try {
              // Cari hesap üzerine yazılanları kaydet
              if (customerToUpdate) {
                  const existingOverrides = customerToUpdate.ledgerOverrides || [];
                  const filtered = existingOverrides.filter(o => !newOverrides.some(n => n.txId === o.txId));
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), {
                      ledgerOverrides: [...filtered, ...newOverrides]
                  }, { merge: true });
              }

              // Oda fiyat geçmişine kaydet
              const historyEntry = {
                  id: Date.now(), date: startDate.toLocaleDateString('tr-TR'), oldFee: 'Manuel Düzenleme', newFee: amount,
                  percentage: 'Geçmiş Zam', anniversaryYear: startDate.getFullYear(), yearsPassed: 'Manuel'
              };
              const roomToUpdate = rooms.find(r => r.id === selectedRoomId);
              if (roomToUpdate) {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(selectedRoomId)), {
                      priceHistory: [...(roomToUpdate.priceHistory || []), historyEntry]
                  }, { merge: true });
              }
          } catch(e) { console.error("Firebase Geçmiş Zam Hatası:", e); }
      }

      setIsPastIncreaseModalOpen(false);
      setPastIncreaseData({ date: new Date().toISOString().split('T')[0], amount: '' });
  };

const handleSaveSpecificMonthEdit = async () => {
      if (!specificMonthEditData || !specificMonthEditData.newAmount) return;
      
      const amount = Number(specificMonthEditData.newAmount);
      const hasKdv = selectedRoomDetail.hasKdv !== false;
      const baseDebt = hasKdv ? amount / 1.20 : amount;
      const kdvDebt = hasKdv ? amount - baseDebt : 0;
      
      const customerToUpdate = customers.find(c => c.name === selectedRoomDetail.customerName);

      if (customerToUpdate && db && firebaseUser) {
          try {
              const existingOverrides = customerToUpdate.ledgerOverrides || [];
              const filtered = existingOverrides.filter(o => o.txId !== specificMonthEditData.txId);
              
              const newOverride = {
                  txId: specificMonthEditData.txId,
                  date: specificMonthEditData.date ? new Date(specificMonthEditData.date).getTime() : Date.now(),
                  desc: specificMonthEditData.desc,
                  debt: amount, baseDebt: baseDebt, kdvDebt: kdvDebt, credit: 0
              };
              
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), {
                  ledgerOverrides: [...filtered, newOverride]
              }, { merge: true });
          } catch(e) { console.error("Firebase Aylık Kira Düzenleme Hatası:", e); }
      }

      setIsEditSpecificMonthModalOpen(false);
      setSpecificMonthEditData(null);
  };

const handleGiftSpecificMonth = async () => {
      if (!specificMonthEditData) return;
      
      const customerToUpdate = customers.find(c => c.name === selectedRoomDetail.customerName);

      if (customerToUpdate && db && firebaseUser) {
          try {
              const existingOverrides = customerToUpdate.ledgerOverrides || [];
              const filtered = existingOverrides.filter(o => o.txId !== specificMonthEditData.txId);
              
              const newOverride = {
                  txId: specificMonthEditData.txId,
                  date: specificMonthEditData.date ? new Date(specificMonthEditData.date).getTime() : Date.now(),
                  desc: `${selectedRoomDetail.name} Odası - Bu Ay Hediye Edildi`,
                  debt: 0, baseDebt: 0, kdvDebt: 0, credit: 0,
                  isSpecificGift: true
              };
              
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerToUpdate.id)), {
                  ledgerOverrides: [...filtered, newOverride]
              }, { merge: true });
          } catch(e) { console.error("Firebase Özel Hediye Ay Düzenleme Hatası:", e); }
      }

      setIsEditSpecificMonthModalOpen(false);
      setSpecificMonthEditData(null);
  };

  // --- TÜMÜNÜ SIFIRLAMA ---
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
const handleResetAll = async () => {
      if (db && firebaseUser) {
          try {
              for (const r of rooms) {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(r.id)), {
                      customerName: null, isReserved: false, paidMonths: []
                  }, { merge: true });
              }
          } catch (e) { console.error("Sıfırlama Hatası:", e); }
      }
      setIsResetModalOpen(false);
  };

// YENİ EKLENEN: Oda detayından randevu oluşturma (takvimle aynı yapı) + WhatsApp paylaşımı
const handleSaveRoomAppointment = () => {
    const room = selectedRoomDetail;
    if (!room || !room.customerName) { alert('Bu oda için müşteri bulunamadı.'); return; }
    const customer = customers.find(c => c.name === room.customerName);
    const block = blocks.find(b => b.id === room.blockId);
    const whId = block?.warehouseId || warehouses[0]?.id || 1;

    const newAppt = {
        id: Date.now(),
        customerType: 'registered',
        customerId: customer?.id || null,
        customerName: room.customerName,
        customerPhone: customer?.phone || '',
        warehouseId: parseInt(whId),
        date: roomAppointmentData.date,
        time: roomAppointmentData.time,
        purpose: roomAppointmentData.purpose,
        createdBy: currentUserProfile?.name || 'Sistem',
        createdByRole: currentUserProfile?.role || '',   // YENİ: yetki bilgisi
        createdAt: Date.now(),                           // YENİ: oluşturma anı
        roomName: room.name
    };

    // Takvime kaydet (canlı + önizleme)
    if (db && firebaseUser) {
        try { setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', String(newAppt.id)), newAppt); } catch(e) { console.error(e); }
    }
    setAppointments(prev => [...prev, newAppt]);

    // Takvimi o güne getir
    setSelectedCalendarDate(roomAppointmentData.date);
    const d = new Date(roomAppointmentData.date);
    setCalendarMonth(d.getMonth());
    setCalendarYear(d.getFullYear());

    return newAppt;
};

const handleShareRoomAppointmentWhatsApp = () => {
    const room = selectedRoomDetail;
    if (!room) return;
    const customer = customers.find(c => c.name === room.customerName);
    const purposeLabel = appointmentPurposes[roomAppointmentData.purpose]?.label || '';
    const dateStr = new Date(roomAppointmentData.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const companyName = contractSettings.accountHolder || 'Sembol Nakliyat Depoculuk';

    const text = `Sayın ${customer?.name || room.customerName},\n\n*${room.name}* numaralı odanız için randevunuz oluşturulmuştur.\n\n📅 *Tarih:* ${dateStr}\n🕒 *Saat:* ${roomAppointmentData.time}\n📋 *İşlem:* ${purposeLabel}\n\nRandevu saatinde deponuzda hazır bulunmanızı rica ederiz. Değişiklik için lütfen bizimle iletişime geçiniz.\n\nİyi günler dileriz.\n${companyName}`;

    let phone = (customer?.phone || '').replace(/\D/g, '');
    if (phone.startsWith('0')) phone = phone.substring(1);
    if (phone.startsWith('90')) phone = phone.substring(2);
    const url = `https://wa.me/90${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

const handleSaveAppointment = async (notifyWhatsApp = false) => {
    if (appointmentData.customerType === 'registered' && !appointmentData.customerId) return;
    if (appointmentData.customerType === 'unregistered' && (!appointmentData.unregisteredName || !appointmentData.unregisteredPhone)) return;
    if (!appointmentData.warehouseId || !appointmentData.date || !appointmentData.time) return;

    let customerName = appointmentData.unregisteredName.toUpperCase();
    let customerPhone = appointmentData.unregisteredPhone;
    let cId = null;

    if (appointmentData.customerType === 'registered') {
        // String veya Number ID eşleşme garantisi
        const cust = customers.find(c => String(c.id) === String(appointmentData.customerId));
        if (cust) {
            customerName = cust.name;
            customerPhone = cust.phone;
            cId = cust.id;
        }
    }

const newAppt = {
        id: Date.now(),
        customerType: appointmentData.customerType,
        customerId: cId,
        customerName,
        customerPhone,
        warehouseId: parseInt(appointmentData.warehouseId),
        date: appointmentData.date,
        time: appointmentData.time,
        purpose: appointmentData.purpose,
        // DÜZELTİLDİ: Randevuyu OLUŞTURAN kişi kaydedilmiyordu; bu yüzden randevu
        // listesinde "kim açtı" bilgisi hiç görünmüyordu (alan boş kalıyordu).
        // Oda üzerinden açılan randevularda bu alan zaten yazılıyordu — artık
        // "Yeni Randevu Ekle" ile açılanlarda da yazılıyor.
        createdBy: currentUserProfile?.name || 'Sistem',
        createdByRole: currentUserProfile?.role || '',   // yetki bilgisi (Yönetici / Depo Sorumlusu vb.)
        createdAt: Date.now()                            // oluşturma anı (tarih-saat gösterimi için)
    };

    // FİREBASE'E KAYIT İŞLEMİ
    // DÜZELTİLDİ: Randevu daha önce SADECE Firebase dinleyicisi (onSnapshot) döndüğünde ekrana geliyordu.
    // Artık kayıt anında yerel state'e de eklenir (optimistic update) → kullanıcı takvimde hemen görür;
    // dinleyici geldiğinde aynı id ile birleştirildiği için çift kayıt oluşmaz.
    setAppointments(prev => (prev || []).some(a => String(a.id) === String(newAppt.id)) ? prev : [...(prev || []), newAppt]);
    if (db && firebaseUser) {
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', String(newAppt.id)), newAppt);
        } catch(e) { console.error("Firebase Randevu Kayıt Hatası:", e); }
    }

    // YENİ: WhatsApp'tan bilgilendirme istendiyse mesaj penceresini aç
    if (notifyWhatsApp) {
        const wh = warehouses.find(w => w.id === parseInt(appointmentData.warehouseId));
        const purposeLabel = appointmentPurposes[appointmentData.purpose]?.label || '';
        const dateFmt = new Date(appointmentData.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
        const text = `Merhaba ${customerName},\n\n📅 *Randevu Bilgilendirmesi*\n\n• Tarih: *${dateFmt}*\n• Saat: *${appointmentData.time}*\n• Şube: *${wh?.name || '-'}*${wh?.address ? '\n• Adres: ' + wh.address : ''}${wh?.mapLink ? '\n• Konum: ' + wh.mapLink : ''}\n• Konu: *${purposeLabel}*\n\nRandevunuz oluşturulmuştur. Görüşmek üzere!\n\nDepoEvim`;
        let raw = String(customerPhone || '').replace(/\D/g, '');
        if (raw.startsWith('90')) raw = raw.slice(2);
        if (raw.startsWith('0')) raw = raw.slice(1);
        window.open(`https://wa.me/90${raw}?text=${encodeURIComponent(text)}`, '_blank');
    }

    // RANDEVU EKLENDİKTEN SONRA EKRANI SIFIRLA
    setAppointmentData({
        customerType: 'registered',
        customerId: '',
        unregisteredName: '',
        unregisteredPhone: '',
        warehouseId: '',
        date: new Date().toISOString().split('T')[0],
        time: '10:00 - 11:00',
        purpose: 'giris-cikis'
    });
    
    setSelectedCalendarDate(appointmentData.date);
    const d = new Date(appointmentData.date);
    setCalendarMonth(d.getMonth());
    setCalendarYear(d.getFullYear());
    setActiveMenu('takvim');
  };

  const handleDeleteAppointment = async (id) => {
      if (db && firebaseUser) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', String(id)));
          } catch(e) { console.error("Randevu Silme Hatası:", e); }
      }
  };

  const handleSaveEditAppointment = async () => {
      if (!editApptData) return;
      // DÜZELTİLDİ: Düzenleme de anında yerel state'e yansıtılır (dinleyici gecikmesine bağlı kalmaz)
      setAppointments(prev => (prev || []).map(a => String(a.id) === String(editApptData.id) ? { ...a, ...editApptData } : a));
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'appointments', String(editApptData.id)), editApptData, { merge: true });
          } catch(e) { console.error("Randevu Güncelleme Hatası:", e); }
      }
      setIsEditApptModalOpen(false);
      setEditApptData(null);
  };

  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month, year) => {
      let day = new Date(year, month, 1).getDay();
      return day === 0 ? 6 : day - 1; // Pzt=0, Paz=6 yapıyoruz
  };


  // YENİ EKLENEN: Oda Listesi kartındaki oda fotoğrafını (roomListPhoto) ekle/değiştir
  const handleSetRoomListPhoto = async (roomId, file) => {
      if (!file) return;
      try {
          const url = await uploadImageToServer(file);
          if (db && firebaseUser) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(roomId)), { roomListPhoto: url }, { merge: true });
          } else {
              setRooms(prev => prev.map(r => r.id === roomId ? { ...r, roomListPhoto: url } : r));
          }
      } catch (e) { console.error('Oda Fotoğrafı Yükleme Hatası:', e); }
  };
  const handleRemoveRoomListPhoto = async (roomId) => {
      if (!window.confirm('Oda liste fotoğrafını kaldırmak istediğinize emin misiniz?')) return;
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(roomId)), { roomListPhoto: null }, { merge: true }); } catch(e){ console.error(e); }
      } else {
          setRooms(prev => prev.map(r => r.id === roomId ? { ...r, roomListPhoto: null } : r));
      }
  };

  // handleSetEntityPhoto / handleRemoveEntityPhoto (depo/blok fotoğrafı) → src/depo.jsx içine taşındı.

  const handleUpdateAllLedgers = () => {
      setIsUpdateAllModalOpen(true);
      setIsUpdatingAll(true);

      // Tarama hissi yaratmak için küçük bir gecikme ekliyoruz
      setTimeout(() => {
          let totalUnpaid = 0;
          let affectedCustomers = 0;

          customers.forEach(c => {
              // Sistem girdiği gün ile bugünün tarihi arasını zaten dinamik tarar
              const { balance } = getCustomerLedger(c);
              if (balance > 0) {
                  totalUnpaid += balance;
                  affectedCustomers++;
              }
          });

          // Uygulamadaki tüm state'i güncellemek (force re-render) için spread kullanıyoruz
          setCustomers([...customers]);
          setRooms([...rooms]);

          setUpdateAllStats({
              totalUnpaid,
              affectedCustomers,
              date: new Date().toLocaleDateString('tr-TR')
          });
          setIsUpdatingAll(false);
      }, 2000);
  };

  const appointmentPurposes = {
      'giris-cikis': { label: 'Odadan Giriş - Çıkış', color: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-200', bgLight: 'bg-blue-50' },
      'ziyaret': { label: 'Yeni Müşteri Adayı Ziyaret', color: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-200', bgLight: 'bg-purple-50' },
      'esya-getirme': { label: 'Yeni Müşteri Eşya Getiriyor', color: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200', bgLight: 'bg-emerald-50' },
      'tahliye': { label: 'Odadan Tüm Eşyaları Kendisi Çıkaracak', color: 'bg-red-500', text: 'text-red-700', border: 'border-red-200', bgLight: 'bg-red-50' },
      'temizlik': { label: 'Depo Temizlik', color: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-200', bgLight: 'bg-orange-50' },
  };

  const menuItems = [
    { id: 'dashboard', label: 'Anasayfa', icon: LayoutDashboard, permId: 'menu-dashboard' },
    { id: 'takvim', label: 'Randevular', icon: Calendar, permId: 'menu-takvim' },
    { id: 'hatirlatmalar', label: 'Hatırlatmalar', icon: Bell, permId: 'menu-hatirlatmalar' },
    { id: 'tum-musteriler', label: 'Müşteri Listesi', icon: Users, permId: 'menu-musteri-listesi' },
    { id: 'odeme-islemleri', label: 'Ödeme İşlemleri', icon: Wallet, permId: 'menu-odeme-islemleri', subItems: [
        { id: 'odeme-girisi', label: 'Tahsilat Girişi Yap', permId: 'page-odeme-girisi' }, 
        { id: 'askida-kalan-odemeler', label: 'Askıda Kalan Tahsilatlar', permId: 'page-askida-kalan-odemeler' },
        { id: 'tahsilat-hareketleri', label: 'Tahsilat Hareketleri', permId: 'page-tahsilat-hareketleri' },
        { id: 'gunu-gelen-odalar', label: 'Günü Gelen Odalar', permId: 'page-gunu-gelen-odalar' },
        { id: 'senesi-dolan-odalar', label: 'Senesi Dolan Odalar', permId: 'page-senesi-dolan-odalar' },
        { id: 'aylik-odeme', label: 'Aylık Borç Takip', permId: 'page-aylik-odeme' },
        { id: 'icra-odalari', label: 'İcra Odaları', permId: 'page-icra-odalari' },
        // YENİ: Hediye ay kullanan tüm odaların listelendiği sayfa
        { id: 'hediye-verilen-odalar', label: 'Hediye Verilen Odalar', permId: 'page-hediye-verilen-odalar' }
    ] },
    { id: 'depo', label: 'Depo Listesi', icon: Box, permId: 'menu-depo' },
    { id: 'finans-yonetimi', label: 'Finans Yönetimi', icon: TrendingUp, permId: 'menu-finans-yonetimi', subItems: [
        { id: 'finans-rapor', label: 'Finans Rapor', permId: 'page-finans-rapor' },
        { id: 'depo-rapor', label: 'Depo Rapor', permId: 'page-depo-rapor' },
        { id: 'personel-rapor', label: 'Personel Rapor', permId: 'page-personel-rapor' }
    ] },
    { id: 'sistem-hesaplari', label: 'Sistem Hesapları', icon: UserCog, permId: 'menu-sistem-hesaplari', subItems: [
        { id: 'panel-kullanicilari', label: 'Panel Kullanıcıları', permId: 'page-panel-kullanicilari' },
        { id: 'kullanici-rolleri', label: 'Kullanıcı Rolleri', permId: 'page-kullanici-rolleri' },
        { id: 'kullanici-hareketleri', label: 'Kullanıcı Hareketleri', permId: 'page-kullanici-hareketleri' }
    ] },
{ id: 'sistem-ayarlari', label: 'Sistem Ayarları', icon: Settings, permId: 'menu-sistem-ayarlari',
    subItems: [
        { id: 'pdf-sozlesme', label: 'PDF & Sözleşme Ayarları', permId: 'page-pdf-sozlesme' },
        { id: 'tahsilat-oranlari', label: 'Tahsilat Oranları', permId: 'page-tahsilat-oranlari' },
        { id: 'islem-hareketleri', label: 'İşlem Hareketleri', permId: 'page-islem-hareketleri' },
        { id: 'islem-geri-yukle', label: 'İşlem Geri Yükle', permId: 'page-islem-geri-yukle' },
        { id: 'sistem-yedekleme', label: 'Sistem Yedekleme', permId: 'page-sistem-yedekleme' }
    ] },
  ]; // <-- İŞTE EKSİK OLAN KAPANIŞ PARANTEZİ BU!

  const selectedRoomDetail = rooms.find(r => r.id === selectedRoomId);

  const parseDateLocal = (dateString) => {
    if (!dateString) return new Date();
    const parts = dateString.split('-');
    if(parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
    return new Date(dateString);
  };

  // --- DİNAMİK GÖSTERGE PANELİ (DASHBOARD) VERİLERİ ---
  const totalCustomersCount = customers.length;
  const activeRentalsList = rooms.filter(r => r.customerName);
  const activeRentalsCount = activeRentalsList.length;
  const uniqueTenantsCount = new Set(activeRentalsList.map(r => r.customerName)).size;
  const activeTenantPercentage = totalCustomersCount > 0 ? ((uniqueTenantsCount / totalCustomersCount) * 100).toFixed(1) : 0;
  const roomCapacityPercentage = rooms.length > 0 ? ((activeRentalsCount / rooms.length) * 100).toFixed(1) : 0;

  const todayObj = new Date();
  const todayDay = todayObj.getDate();
  let next7DaysList = [];
  for(let i=1; i<=7; i++) {
      let d = new Date(todayObj);
      d.setDate(todayObj.getDate() + i);
      next7DaysList.push(d.getDate());
  }

  const dueTodayCount = activeRentalsList.filter(r => {
      const d = parseDateLocal(r.paymentDate || r.entryDate || '2026-01-01');
      return d.getDate() === todayDay;
  }).length;
  const dueTodayPercentage = activeRentalsCount > 0 ? ((dueTodayCount / activeRentalsCount) * 100).toFixed(1) : 0;

  const dueNext7Count = activeRentalsList.filter(r => {
      const d = parseDateLocal(r.paymentDate || r.entryDate || '2026-01-01');
      return next7DaysList.includes(d.getDate());
  }).length;
  const dueNext7Percentage = activeRentalsCount > 0 ? ((dueNext7Count / activeRentalsCount) * 100).toFixed(1) : 0;

  // Yeni Kartların Hesaplamaları
  const totalRoomsCount = rooms.length;
  const emptyRoomsCount = totalRoomsCount - activeRentalsCount;
  const emptyRoomPercentage = totalRoomsCount > 0 ? ((emptyRoomsCount / totalRoomsCount) * 100).toFixed(1) : 0;

  const overdueCount = activeRentalsList.filter(r => {
      const entryD = parseDateLocal(r.entryDate || '2026-01-01');
      const paymentAnchorD = r.paymentDate && r.paymentDate.includes('-') ? parseDateLocal(r.paymentDate) : entryD;
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Sadece geçmiş günleri al (bugün hariç)
      
      let loopDate = new Date(paymentAnchorD);
      let hasOverdue = false;
      let monthCounter = 0;
      
      while (loopDate < today) {
          const key = `${loopDate.getFullYear()}-${loopDate.getMonth()}`;
          const isGifted = isGiftedMonth(r, monthCounter);
          const isFree = r.isFreeRoom;
          
if (!r.paidMonths?.includes(key) && !isGifted && !isFree) {
              hasOverdue = true;
              break;
          }
          const targetDay = r.paymentDate && !r.paymentDate.includes('-') ? parseInt(r.paymentDate) : paymentAnchorD.getDate();
          let nMonth = loopDate.getMonth() + 1;
          let nYear = loopDate.getFullYear();
          if (nMonth > 11) { nMonth = 0; nYear++; }
          let maxDayInNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
          loopDate = new Date(nYear, nMonth, Math.min(targetDay, maxDayInNextMonth));
          
          monthCounter++;
      }
      return hasOverdue;
  }).length;
  const overduePercentage = activeRentalsCount > 0 ? ((overdueCount / activeRentalsCount) * 100).toFixed(1) : 0;

  // YENİ EKLENEN: Personelin pozisyonuna göre HER GÜN değişen motive edici söz
  const getDailyMotivation = () => {
      const role = (getCurrentRole()?.name || currentUserProfile.role || '').toLocaleLowerCase('tr-TR');
      const genel = [
          'Bugün küçük bir adım, yarın büyük bir fark yaratır.',
          'Başarı, her gün tekrarlanan küçük çabaların toplamıdır.',
          'İyi bir gün, iyi bir planla başlar. Haydi başlayalım!',
          'Detaylara gösterdiğin özen, farkı yaratan şeydir.',
          'Bugün de harika işler başaracağına eminiz!',
          'Disiplin, hedeflerinle bugünün arasındaki köprüdür.',
          'Gülümse, çünkü bugün yeni fırsatlarla dolu.'
      ];
      const yonetici = [
          'Ekibine ilham ver; liderlik örnek olmakla başlar.',
          'Doğru kararlar, sağlam bir günün temelini atar.',
          'Bugün ekibinle birlikte yeni bir başarıya imza at.',
          'Vizyonun net, hedeflerin ulaşılabilir. İyi yönetimler!',
          'Bir liderin gücü, ekibine kattığı değerle ölçülür.',
          'Planla, delege et, takip et — bugün senin günün.',
          'İstikrarlı liderlik, kalıcı başarının anahtarıdır.'
      ];
      const muhasebe = [
          'Rakamlar konuşur; sen onları en iyi anlayansın.',
          'Bugün her kuruş yerini bulacak, tahsilatlar akacak!',
          'Düzenli kayıt, huzurlu bir kapanış demektir.',
          'Titizliğin, şirketin sağlam finansal geleceğidir.',
          'Bugün de defterler tık gibi tutulacak!',
          'Doğru hesap, güçlü bir yarının teminatıdır.',
          'Detaydaki ustalığınla bugün fark yaratacaksın.'
      ];
      const personel = [
          'Bugün güler yüzünle bir müşterinin gününü güzelleştir.',
          'Her tamamlanan iş, seni bir adım öne taşır.',
          'Ekibin en değerli parçasısın; bugün de öyle olacak!',
          'Özenli çalışman fark edilir, sürdürmeye devam!',
          'Bugün küçük bir jest, büyük bir memnuniyet yaratır.',
          'Enerjinle bugüne pozitif bir başlangıç yap!',
          'Yaptığın her iş, güvenle inşa edilen bir tuğladır.'
      ];
      let list = genel;
      if (role.includes('yönetici') || role.includes('yonetici') || role.includes('müdür') || role.includes('mudur')) list = yonetici;
      else if (role.includes('muhasebe')) list = muhasebe;
      else if (role.includes('personel')) list = personel;
      // Yılın gününe göre sabit seçim → aynı gün herkes için aynı, ertesi gün değişir
      const now = new Date();
      const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
      return list[dayOfYear % list.length];
  };

  const getGreetingByHour = () => {
      const h = new Date().getHours();
      if (h < 6) return 'İyi geceler';
      if (h < 12) return 'Günaydın';
      if (h < 18) return 'İyi günler';
      return 'İyi akşamlar';
  };

  // YENİ EKLENEN: Gösterge Paneli detayları için yardımcı hesaplar
  // "dd.mm.yyyy" veya ISO tarihini Date'e çevir
  const parseAnyDate = (s) => {
      if (!s) return null;
      if (typeof s === 'string' && s.includes('.')) {
          const [d, m, y] = s.split('.');
          return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      }
      const dt = new Date(s);
      return isNaN(dt.getTime()) ? null : dt;
  };
  // Bir tarih, seçili zaman aralığında mı? (today | month | year)
  const inDashboardRange = (dateObj, range) => {
      if (!dateObj) return false;
      const now = new Date();
      if (range === 'today') {
          return dateObj.getDate() === now.getDate() && dateObj.getMonth() === now.getMonth() && dateObj.getFullYear() === now.getFullYear();
      }
      if (range === 'yesterday') {
          // YENİ: Dün — bugünden bir önceki takvim günü
          const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          return dateObj.getDate() === y.getDate() && dateObj.getMonth() === y.getMonth() && dateObj.getFullYear() === y.getFullYear();
      }
      if (range === 'week') {
          // Bu hafta (Pazartesi başlangıçlı)
          const d = new Date(now); const day = (d.getDay() + 6) % 7; // Pzt=0
          const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
          const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
          return dateObj >= monday && dateObj <= sunday;
      }
      if (range === 'month') {
          return dateObj.getMonth() === now.getMonth() && dateObj.getFullYear() === now.getFullYear();
      }
      if (range === 'year') {
          return dateObj.getFullYear() === now.getFullYear();
      }
      return true; // 'all' — Tüm Zamanlar
  };

  // YENİ: Seçilen zaman aralığına göre kart sayıları (Gösterge Paneli filtresi)
  const dashboardRangeLabels = { today: 'Bugün', yesterday: 'Dün', week: 'Bu hafta', month: 'Bu ay', year: 'Bu sene', all: 'Tüm zamanlarda' };
  const rangeLabel = dashboardRangeLabels[dashboardRange] || 'Bugün';
  const rangeNewCustomersCount = customers.filter(c => inDashboardRange(parseAnyDate(c.createdAt), dashboardRange)).length;
  // Bugün çıkış yapan müşteri sayısı (kart 2 için) — odaların çıkış geçmişinden
  const collectExits = (range) => {
      const list = [];
      rooms.forEach(r => {
          // YENİ: Odasına Git butonunun çalışması için oda ve konum kimlikleri de eklenir
          const blk = blocks.find(b => b.id === r.blockId);
          (r.entryExitHistory || []).forEach(h => {
              if (h.exitDate) {
                  const d = parseAnyDate(h.exitDate);
                  if (inDashboardRange(d, range)) list.push({ name: h.customerName || r.customerName || '-', roomName: r.name, date: h.exitDate, dateObj: d, customerName: h.customerName || r.customerName, roomId: r.id, blockId: r.blockId, warehouseId: blk?.warehouseId });
              }
          });
      });
      return list;
  };
  const rangeExitsCount = collectExits(dashboardRange).length;
  // Bugün giren oda sayısı (kart 3) — entryExitHistory girişleri + aktif odaların entryDate'i
  const collectEntries = (range) => {
      const list = [];
      rooms.forEach(r => {
          // YENİ: Odasına Git butonunun çalışması için oda ve konum kimlikleri de eklenir
          const blk = blocks.find(b => b.id === r.blockId);
          if (r.customerName && r.entryDate) {
              const d = parseAnyDate(r.entryDate);
              if (inDashboardRange(d, range)) list.push({ name: r.customerName, roomName: r.name, date: r.entryDate, dateObj: d, customerName: r.customerName, roomId: r.id, blockId: r.blockId, warehouseId: blk?.warehouseId });
          }
          (r.entryExitHistory || []).forEach(h => {
              if (h.entryDate) {
                  const d = parseAnyDate(h.entryDate);
                  if (inDashboardRange(d, range)) list.push({ name: h.customerName || '-', roomName: r.name, date: h.entryDate, dateObj: d, customerName: h.customerName, roomId: r.id, blockId: r.blockId, warehouseId: blk?.warehouseId });
              }
          });
      });
      return list;
  };
  const rangeEntriesCount = collectEntries(dashboardRange).length;

  // YENİ: "Giriş-Çıkış İşlemi" kartı için — SADECE giriş-çıkış işlemi butonuyla eklenen hareketleri sayar.
  // İlk oda kaydı (kiralama/ilk giriş) sayılmaz; yalnızca entryExitHistory kayıtları (buton hareketleri) sayılır.
  const collectEntryExitOps = (range) => {
      const list = [];
      rooms.forEach(r => {
          const blk = blocks.find(b => b.id === r.blockId);
          (r.entryExitHistory || []).forEach(h => {
              // Hareketin tarihi: işlem/çıkış/giriş tarihinden hangisi varsa
              const dRaw = h.date || h.exitDate || h.entryDate;
              if (!dRaw) return;
              const d = parseAnyDate(dRaw);
              if (inDashboardRange(d, range)) list.push({ id: h.id, name: h.customerName || r.customerName || '-', customerName: h.customerName || r.customerName, roomName: r.name, date: dRaw, dateObj: d, roomId: r.id, blockId: r.blockId, warehouseId: blk?.warehouseId });
          });
      });
      return list;
  };
  const rangeEntryExitOpsCount = collectEntryExitOps(dashboardRange).length;

  // YENİ: Takvim menü rozeti — YALNIZCA bugüne ait randevu sayısı (bugün randevu yoksa rozet görünmez)
  const upcomingAppointmentsCount = appointments.filter(a => {
      const d = parseAnyDate(a.date);
      if (!d) return false;
      const now = new Date();
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const dashboardCards = [
    { id: 1, title: 'KAYDEDİLEN MÜŞTERİ', value: rangeNewCustomersCount.toString(), desc: `${rangeLabel} sisteme eklenen müşteriler`, tag: 'Detay için tıklayın', tagColor: 'text-blue-700 bg-blue-100', borderColor: 'border-blue-500', iconColor: 'text-blue-500 bg-blue-50', icon: Users, chartData: [10, 15, 12, 20, 18, 25, 30], chartColor: '#3b82f6' },
    /* SİLİNDİ: 'ÇIKIŞ YAPAN MÜŞTERİLER' kartı (id: 2) — istek üzerine kaldırıldı */
    { id: 3, title: 'GİREN ODA SAYISI', value: rangeEntriesCount.toString(), desc: `${rangeLabel} odaya giriş yapılanlar`, tag: 'Detay için tıklayın', tagColor: 'text-teal-700 bg-teal-100', borderColor: 'border-teal-400', iconColor: 'text-teal-500 bg-teal-50', icon: Box, chartData: [5, 10, 8, 15, 10, 18, 25], chartColor: '#14b8a6' },
    { id: 4, title: 'ÇIKAN ODA SAYISI', value: rangeExitsCount.toString(), desc: `${rangeLabel} odadan çıkış yapılanlar`, tag: 'Detay için tıklayın', tagColor: 'text-blue-700 bg-blue-100', borderColor: 'border-blue-400', iconColor: 'text-blue-500 bg-blue-50', icon: Box, chartData: [10, 12, 15, 10, 20, 25, 20], chartColor: '#3b82f6' },
    { id: 5, title: 'ODAYA GİRİŞ ÇIKIŞ İŞLEMİ YAPAN MÜŞTERİLER', value: rangeEntryExitOpsCount.toString(), desc: `${rangeLabel} oda giriş/çıkış işlemi yapılan müşteriler`, tag: 'Detay için tıklayın', tagColor: 'text-red-700 bg-red-100', borderColor: 'border-red-500', iconColor: 'text-indigo-500 bg-indigo-50', icon: RefreshCcw, chartData: [30, 25, 28, 20, 15, 10, 5], chartColor: '#6366f1' },
    { id: 6, title: 'TOPLAM DEPO', value: warehouses.length.toString(), desc: `${totalRoomsCount} oda kapasitesi (tüm depolar)`, tag: `Genel doluluk %${roomCapacityPercentage}`, tagColor: 'text-purple-700 bg-purple-100', borderColor: 'border-purple-500', iconColor: 'text-purple-500 bg-purple-50', icon: Home, chartData: [10, 10, 10, 10, 10, 10, 10], chartColor: '#a855f7' },
    { id: 7, title: 'DOLU ODA', value: activeRentalsCount.toString(), desc: 'Hesaba bağlı oda sayısı', tag: `Tüm odaların %${roomCapacityPercentage} payı`, tagColor: 'text-green-700 bg-green-100', borderColor: 'border-green-500', iconColor: 'text-green-500 bg-green-50', icon: Box, chartData: [10, 20, 30, 40, 50, 60, 70], chartColor: '#22c55e' },
    { id: 8, title: 'BOŞ ODA', value: emptyRoomsCount.toString(), desc: 'Kiraya hazır kapasite', tag: `Tüm odaların %${emptyRoomPercentage} payı`, tagColor: 'text-gray-600 bg-gray-100', borderColor: 'border-slate-500', iconColor: 'text-slate-500 bg-slate-50', icon: Box, chartData: [50, 40, 30, 20, 10, 5, 2], chartColor: '#64748b' },
  ];

  const renderYearlyPayments = () => {
    if (!selectedRoomDetail) return [];
    const monthsStr = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    
    const entryDate = parseDateLocal(selectedRoomDetail.entryDate || '2026-01-01');
    const paymentAnchorDate = selectedRoomDetail.paymentDate && selectedRoomDetail.paymentDate.includes('-') 
      ? parseDateLocal(selectedRoomDetail.paymentDate) 
      : entryDate;
      
    const baseAmount = Number(selectedRoomDetail.monthlyFee || 0);
    const hasKdv = selectedRoomDetail.hasKdv !== undefined ? selectedRoomDetail.hasKdv : true;
    const kdvAmount = hasKdv ? baseAmount * 0.20 : 0;
    const totalAmount = baseAmount + kdvAmount;

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const customer = customers.find(c => c.name === selectedRoomDetail.customerName);
    const overrides = customer?.ledgerOverrides || [];

    const periods = [];
    let loopDate = new Date(paymentAnchorDate);
    let payIdCounter = 0;
    let monthCounter = 0;
    
    while (loopDate.getFullYear() <= detailYear) {
      if (loopDate.getFullYear() === detailYear) {
        // GÜNCELLENDİ: Dönem, ödeme GÜNÜ GELİNCE (aynı gün) görünür; 1 gün sonraya kaydırma kaldırıldı.
        let periodDueDate = new Date(loopDate.getFullYear(), loopDate.getMonth(), loopDate.getDate());
        periodDueDate.setHours(0, 0, 0, 0);
        // YENİ: Hediye ayları (giftMonths kapsamındaki aylar) vade tarihi henüz gelmese bile
        // dökümde HER ZAMAN gösterilir — böylece 2 ay hediye verildiğinde ikinci hediye ayı da görünür.
        // Bu özel görünürlük yalnızca hediye aylarına aittir; normal aylar eskisi gibi vadesi gelince listelenir.
        const isGiftMonthNow = isGiftedMonth(selectedRoomDetail, monthCounter);
        if (periodDueDate <= today || isGiftMonthNow) {
const start = new Date(loopDate);
          
          const targetDay = selectedRoomDetail.paymentDate && !selectedRoomDetail.paymentDate.includes('-') ? parseInt(selectedRoomDetail.paymentDate) : paymentAnchorDate.getDate();
          let nMonth = start.getMonth() + 1;
          let nYear = start.getFullYear();
          if (nMonth > 11) { nMonth = 0; nYear++; }
          let maxDayInNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
          const end = new Date(nYear, nMonth, Math.min(targetDay, maxDayInNextMonth));

          const paymentKey = `${start.getFullYear()}-${start.getMonth()}`;
          const txId = `debt-${selectedRoomDetail.id}-${paymentKey}`;

          // YENİ: O aya geçerli kira (zam geçmişine göre) — zamdan önceki aylar eski, sonrası yeni kira
          const effectiveBase = getRoomFeeForMonth(selectedRoomDetail, start.getFullYear(), start.getMonth());
          const effKdv = hasKdv ? effectiveBase * 0.20 : 0;
          const effTotal = effectiveBase + effKdv;

          // YENİ: Bu ay zam yapıldıysa ekstra bilgi (increaseHistory effectiveKey eşleşmesi)
          let increaseInfo = null;
          if (Array.isArray(selectedRoomDetail.increaseHistory)) {
              const hit = selectedRoomDetail.increaseHistory.find(h => String(h.effectiveKey) === `${start.getFullYear()}-${start.getMonth()}`);
              // priceHistory'den önceki ücreti bul (varsa)
              if (hit) {
                  const ph = (selectedRoomDetail.priceHistory || []).find(p => Number(p.newFee) === Number(hit.baseFee));
                  increaseInfo = ph ? `Zam: ${Number(ph.oldFee).toLocaleString('tr-TR')} → ${Number(ph.newFee).toLocaleString('tr-TR')} TL` : `Zam uygulandı: ${Number(hit.baseFee).toLocaleString('tr-TR')} TL`;
              }
          }

          let displayTotalAmount = effTotal;
          let displayBaseAmount = effectiveBase;
          let displayKdvAmount = effKdv;
          let isSpecificGift = false;

          const override = overrides.find(o => o.txId === txId);
          if (override && !override.isDeleted && override.debt !== undefined) {
              displayTotalAmount = override.debt;
              displayBaseAmount = override.baseDebt !== undefined ? override.baseDebt : (hasKdv ? displayTotalAmount / 1.20 : displayTotalAmount);
              displayKdvAmount = override.kdvDebt !== undefined ? override.kdvDebt : (hasKdv ? displayTotalAmount - displayBaseAmount : 0);
              if (override.isSpecificGift) isSpecificGift = true;
          }

          const isPaid = selectedRoomDetail.paidMonths?.includes(paymentKey);
          const isGifted = isGiftedMonth(selectedRoomDetail, monthCounter);
          const isFree = selectedRoomDetail.isFreeRoom;

          let stat = isPaid ? 'Ödeme Yapıldı' : (isFree ? 'Ücretsiz Oda' : ((isGifted || isSpecificGift) ? 'Hediye Edildi' : 'Bekliyor'));
          let statColor = isPaid ? 'text-green-600 bg-green-50 border-green-200' : (isFree ? 'text-cyan-600 bg-cyan-50 border-cyan-200' : ((isGifted || isSpecificGift) ? 'text-purple-600 bg-purple-50 border-purple-200' : 'text-orange-600 bg-orange-50 border-orange-200'));

          periods.push({
            id: payIdCounter,
            month: monthsStr[start.getMonth()],
            year: start.getFullYear(),
            amount: (isGifted || isFree || isSpecificGift) ? 0 : displayTotalAmount,
            baseAmount: (isGifted || isFree || isSpecificGift) ? 0 : displayBaseAmount,
            kdvAmount: (isGifted || isFree || isSpecificGift) ? 0 : displayKdvAmount,
            hasKdv: hasKdv,
            status: stat,
            color: statColor,
            increaseInfo: increaseInfo,
            title: `${start.getDate()} ${monthsStr[start.getMonth()]} ${start.getFullYear()} - ${end.getDate()} ${monthsStr[end.getMonth()]} ${end.getFullYear()}`,
            payDay: start.getDate(),
            paymentKey: paymentKey,
            txId: txId,
            dateObj: start,
            isGifted: isGifted || isSpecificGift,
            isFree: isFree,
            isPaid: isPaid
          });
        }
      }
const targetDay = selectedRoomDetail.paymentDate && !selectedRoomDetail.paymentDate.includes('-') ? parseInt(selectedRoomDetail.paymentDate) : paymentAnchorDate.getDate();
      let nMonth = loopDate.getMonth() + 1;
      let nYear = loopDate.getFullYear();
      if (nMonth > 11) { nMonth = 0; nYear++; }
      let maxDayInNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
      loopDate = new Date(nYear, nMonth, Math.min(targetDay, maxDayInNextMonth));

      payIdCounter++;
      monthCounter++;
    }
    return periods;
  };

  const currentPaymentsList = renderYearlyPayments();

  const calculateTotalDebt = () => {
    if (!selectedRoomDetail) return 0;
    const entryDate = parseDateLocal(selectedRoomDetail.entryDate || '2026-01-01');
    const paymentAnchorDate = selectedRoomDetail.paymentDate && selectedRoomDetail.paymentDate.includes('-') 
      ? parseDateLocal(selectedRoomDetail.paymentDate) 
      : entryDate;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    let totalUnpaid = 0;
    let loopDate = new Date(paymentAnchorDate);
    let monthCounter = 0;
    
    const baseAmount = Number(selectedRoomDetail.monthlyFee || 0);
    const hasKdv = selectedRoomDetail.hasKdv !== undefined ? selectedRoomDetail.hasKdv : true;
    const monthlyTotal = hasKdv ? baseAmount * 1.20 : baseAmount;

    const customer = customers.find(c => c.name === selectedRoomDetail.customerName);
    const overrides = customer?.ledgerOverrides || [];

    while (loopDate <= today) {
      const key = `${loopDate.getFullYear()}-${loopDate.getMonth()}`;
      const txId = `debt-${selectedRoomDetail.id}-${key}`;

      // GÜNCELLENDİ: Borç, ödeme GÜNÜ GELİNCE (aynı gün) cariye düşer; 1 gün sonraya kaydırma kaldırıldı.
      let dueDate = new Date(loopDate.getFullYear(), loopDate.getMonth(), loopDate.getDate());
      dueDate.setHours(0, 0, 0, 0);
      const isDueYet = dueDate <= today;

      let currentMonthlyTotal = monthlyTotal;
      const override = overrides.find(o => o.txId === txId);
      if (override && !override.isDeleted && override.debt !== undefined) {
          currentMonthlyTotal = override.debt;
      }

      const isGifted = isGiftedMonth(selectedRoomDetail, monthCounter);
      const isFree = selectedRoomDetail.isFreeRoom;
      
if (isDueYet && !selectedRoomDetail.paidMonths?.includes(key) && !isGifted && !isFree) {
        totalUnpaid += currentMonthlyTotal;
      }
      const targetDay = selectedRoomDetail.paymentDate && !selectedRoomDetail.paymentDate.includes('-') ? parseInt(selectedRoomDetail.paymentDate) : paymentAnchorDate.getDate();
      let nMonth = loopDate.getMonth() + 1;
      let nYear = loopDate.getFullYear();
      if (nMonth > 11) { nMonth = 0; nYear++; }
      let maxDayInNextMonth = new Date(nYear, nMonth + 1, 0).getDate();
      loopDate = new Date(nYear, nMonth, Math.min(targetDay, maxDayInNextMonth));
      
      monthCounter++;
    }
    return totalUnpaid;
  };

  const totalDebt = calculateTotalDebt();

  // --- YENİ EKLENEN: OTOMATİK GECİKME FAİZİ VE CARİ HESAP OLUŞTURUCU ---
  const getCustomerLedger = (customer) => {
      const customerRooms = rooms.filter(r => r.customerName === customer.name);
      const ledgerTransactions = [];
      const monthsStr = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

      // 1. Oda Kiraları
      customerRooms.forEach(room => {
          const entryD = parseDateLocal(room.entryDate || '2026-01-01');
          let paymentAnchorD = room.paymentDate && room.paymentDate.includes('-') ? parseDateLocal(room.paymentDate) : entryD;
          const baseAmt = Number(room.monthlyFee || 0);
          const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
          const monthlyTotal = hasKdv ? baseAmt * 1.20 : baseAmt;

          // Ödeme gününü (day) sabitle, aylar eklendikçe değişmesin
          const targetDay = room.paymentDate && !room.paymentDate.includes('-') ? parseInt(room.paymentDate) : paymentAnchorD.getDate();

          let loopDate = new Date(paymentAnchorD.getFullYear(), paymentAnchorD.getMonth(), 1); 
  
              let monthCounter = 0;
              const today = new Date();
              today.setHours(23, 59, 59, 999);

              // GÜNCELLENDİ: İcra sürecinde borçlandırma ARTIK DURMAZ — cari borçlanmaya devam eder.
              // (Eski davranış: icra başlangıç tarihinde hesaplama durduruluyordu; istek üzerine kaldırıldı.)
              const calculationEndDate = today;

              // YENİ: Hediye ayları vadesi gelmese bile cariye/ekstreye 0 TL olarak eklensin diye,
              // döngü hediye döneminin sonuna kadar da ilerler (oda dökümündeki davranışla aynı).
              const giftEndIndex = Number(room.giftMonths) > 0 ? (Number(room.giftStartMonthIndex || 0) + Number(room.giftMonths)) : 0;

              // Bugüne kadar olan ayları (ve varsa gelecekteki hediye aylarını) tara
              while ((loopDate.getFullYear() < calculationEndDate.getFullYear() || (loopDate.getFullYear() === calculationEndDate.getFullYear() && loopDate.getMonth() <= calculationEndDate.getMonth())) || monthCounter < giftEndIndex) {
                  const year = loopDate.getFullYear();
                  const month = loopDate.getMonth();
                  const key = `${year}-${month}`;
                  
                  let maxDayInMonth = new Date(year, month + 1, 0).getDate(); 
                  let actualPayDay = Math.min(targetDay, maxDayInMonth); 
                  let txDate = new Date(year, month, actualPayDay);

                  // GÜNCELLENDİ: Borç, ödeme GÜNÜ GELİNCE (aynı gün) cariye düşer; 1 gün sonraya kaydırma kaldırıldı.
                  // Görünen tarih (txDate/dateStr) da ödeme günüdür.
                  let dueDate = new Date(year, month, actualPayDay);
                  dueDate.setHours(0, 0, 0, 0);

                  // YENİ: Hediye ayları (0 TL) vadesi gelmeden de eklenir; normal aylar eskisi gibi vadesi gelince eklenir.
                  const isGifted = isGiftedMonth(room, monthCounter);
                  if (dueDate <= calculationEndDate || isGifted) {
                  const isFree = room.isFreeRoom;
                  // YENİ EKLENEN: Zam geçmişi (increaseHistory) — o aya geçerli baz kira seçilir.
                  // Zam yalnızca etkin ayından (effectiveKey) itibaren geçerli olur; önceki aylar eski ücretle kalır.
                  // increaseHistory yoksa odanın güncel monthlyFee'si tüm aylara uygulanır (eski davranış korunur).
                  // DÜZELTİLDİ: Buradaki hesap kendi içinde tekrar yazılmıştı ve zam kaydı
                  // bulunamayan (ilk zamdan ESKİ) aylarda "baseAmt" (odanın GÜNCEL zamlı kirası)
                  // kullanıyordu — bu yüzden zam yapılınca geçmiş ayların cari tutarları da
                  // değişiyordu. Artık tek kaynak olan getRoomFeeForMonth kullanılıyor:
                  // her ay, YALNIZCA o ayda yürürlükte olan kira ile hesaplanır.
                  const effectiveBase = getRoomFeeForMonth(room, year, month);
                  // YENİ EKLENEN: "Carisini KDV'li Yap" sonrası, sadece geçiş ayından (kdvStartKey) itibaren
                  // borçlandırma KDV dahil işlenir; öncesi eski (KDV'siz) haliyle kalır.
                  // kdvStartKey yoksa odanın kendi hasKdv değeri tüm aylara uygulanır (eski davranış korunur).
                  let monthHasKdv = hasKdv;
                  // Sonradan "KDV'li Yap" ile çevrilen odalarda tutar SABİT kalır: geçişten sonraki
                  // aylarda effectiveBase "KDV dahil tutar" kabul edilir (içeriden KDV ayrıştırılır).
                  let isConvertedKdvMonth = false;
                  if (room.kdvStartKey) {
                      const startParts = String(room.kdvStartKey).split('-');
                      const startY = parseInt(startParts[0]);
                      const startM = parseInt(startParts[1]);
                      const isFromSwitchOnward = (year > startY) || (year === startY && month >= startM);
                      monthHasKdv = isFromSwitchOnward; // geçişten sonra KDV dahil, önce KDV'siz
                      isConvertedKdvMonth = isFromSwitchOnward;
                  }
                  let monthAppliedTotal, appliedBaseAmt2, appliedKdvDebt2;
                  if (isConvertedKdvMonth) {
                      // Tutar değişmez (effectiveBase = KDV dahil); net ve KDV içeriden ayrılır
                      monthAppliedTotal = effectiveBase;
                      appliedBaseAmt2 = Math.round((effectiveBase / 1.20) * 100) / 100;
                      appliedKdvDebt2 = Math.round((effectiveBase - appliedBaseAmt2) * 100) / 100;
                  } else {
                      // Eski davranış: baştan KDV'li odalarda net üzerine %20 eklenir; KDV'sizde olduğu gibi
                      monthAppliedTotal = monthHasKdv ? effectiveBase * 1.20 : effectiveBase;
                      appliedBaseAmt2 = effectiveBase;
                      appliedKdvDebt2 = monthHasKdv ? effectiveBase * 0.20 : 0;
                  }
                  const appliedMonthlyTotal = (isGifted || isFree) ? 0 : monthAppliedTotal;
                  const appliedBaseAmt = (isGifted || isFree) ? 0 : appliedBaseAmt2;
                  const appliedKdvDebt = (isGifted || isFree) ? 0 : appliedKdvDebt2;

                  ledgerTransactions.push({
                      id: `debt-${room.id}-${key}`,
                      date: txDate,
                      dateStr: `${actualPayDay.toString().padStart(2, '0')}.${(month + 1).toString().padStart(2, '0')}.${year}`,
                      desc: `${room.name} Odası - ${monthsStr[month]} ${year} Kirası${isFree ? ' (ÜCRETSİZ)' : (isGifted ? ' (HEDİYE)' : '')}`,
                      debt: appliedMonthlyTotal,
                      baseDebt: appliedBaseAmt,
                      kdvDebt: appliedKdvDebt,
                      credit: 0
                  });

                  const isPaid = room.paidMonths?.includes(key);

                  if (isPaid && !isGifted && !isFree) {
                      ledgerTransactions.push({
                          id: `credit-${room.id}-${key}`,
                          date: new Date(txDate.getTime() + 1000),
                          dateStr: `${actualPayDay.toString().padStart(2, '0')}.${(month + 1).toString().padStart(2, '0')}.${year}`,
                          desc: `${room.name} Odası - ${monthsStr[month]} ${year} Tahsilatı`,
                          debt: 0,
                          baseDebt: 0,
                          kdvDebt: 0,
                          credit: monthAppliedTotal
                      });
                  }
                  monthCounter++;
              }
              // Bir sonraki aya geç
              loopDate.setMonth(loopDate.getMonth() + 1);
          }
      });

      // 2. Global Ödemeler
      if (customer.payments) {
          customer.payments.forEach(pay => {
              // Otomatik nakliye/taşıma tahsilatları kaldırıldı — cari ekstrede gösterilmez
              const noteLower = String(pay.note || '').toLowerCase();
              if (noteLower.includes('nakliye') || noteLower.includes('taşıma')) return;
              const pDate = new Date(pay.date);
              ledgerTransactions.push({
                  id: `credit-global-${pay.id}`,
                  date: pDate,
                  dateStr: `${pDate.getDate().toString().padStart(2, '0')}.${(pDate.getMonth() + 1).toString().padStart(2, '0')}.${pDate.getFullYear()}`,
                  desc: `Cari Tahsilat ${pay.note ? '- ' + pay.note : ''}`,
                  debt: 0,
                  baseDebt: 0,
                  kdvDebt: 0,
                  // YENİ: Onay bekleyen (aynı gün+aynı tutar) tahsilat bakiyeye İŞLENMEZ (credit=0); onaylanınca normal işlenir.
                  credit: pay.needsConfirm ? 0 : Number(pay.amount),
                  needsConfirm: !!pay.needsConfirm,                       // soluk gösterim + butonlar için
                  pendingAmount: pay.needsConfirm ? Number(pay.amount) : 0, // soluk gösterilecek tutar
                  payId: pay.id                                           // Onayla/Sil/Askıya işlemleri için
              });
          });
      }

      // 3. Ekstra Borçlar
      if (customer.extraDebts) {
          customer.extraDebts.forEach(debt => {
              // ═══════════════════════════════════════════════════════════════
              // DÜZELTİLDİ: ELLE EKLENEN BORÇLAR ARTIK CARİDE GÖRÜNÜYOR
              // ESKİ HATA: Açıklamasında "nakliye" veya "taşıma" geçen HER kayıt
              // ekstreden gizleniyordu. Oysa "Cari Ödeme (Borç) Ekle" penceresinin
              // örnek metni bile "Ekstra Nakliye Hizmeti" — kullanıcı bu şekilde
              // borç girdiğinde kayıt veritabanına yazılıyor ama caride HİÇ
              // görünmüyordu (sessizce filtreleniyordu).
              // YENİ KURAL: Gizleme yalnızca SİSTEMİN otomatik ürettiği taşıma
              // kayıtları (type='transport') ve elle GİRİLMEMİŞ eski nakliye
              // kayıtları için geçerli. ELLE eklenen borçlar (type='manual_debt')
              // açıklaması ne olursa olsun HER ZAMAN caride gösterilir.
              // ═══════════════════════════════════════════════════════════════
              const _isManual = debt.type === 'manual_debt';
              const _descL = String(debt.desc || '').toLowerCase();
              if (!_isManual && (debt.type === 'transport' || _descL.includes('nakliye') || _descL.includes('taşıma'))) return;
              const dDate = new Date(debt.date);
              const amount = Number(debt.amount);
              const hasKdv = debt.hasKdv !== false; // Eğer özellik yoksa KDV'li varsay (geçmişe dönük destek)
              const baseDebt = hasKdv ? amount / 1.2 : amount;
              const kdvDebt = hasKdv ? amount - baseDebt : 0;
              
              ledgerTransactions.push({
                  id: `debt-extra-${debt.id}`,
                  date: dDate,
                  dateStr: `${dDate.getDate().toString().padStart(2, '0')}.${(dDate.getMonth() + 1).toString().padStart(2, '0')}.${dDate.getFullYear()}`,
                  desc: debt.desc,
                  debt: amount,
                  baseDebt: baseDebt,
                  kdvDebt: kdvDebt,
                  credit: 0
              });
          });
      }

      // 4. Override (Düzenleme) Mantığı
      let modifiedLedger = [];
      ledgerTransactions.forEach(tx => {
          const override = customer.ledgerOverrides?.find(o => o.txId === tx.id);
          if (override && override.isDeleted) return;
          if (override) {
              const oDate = override.date ? new Date(override.date) : tx.date;
              const finalDebt = override.debt !== undefined ? override.debt : tx.debt;
              const ratio = tx.debt > 0 ? finalDebt / tx.debt : 0;
              modifiedLedger.push({
                  ...tx,
                  desc: override.desc || tx.desc,
                  debt: finalDebt,
                  baseDebt: tx.baseDebt * ratio || 0,
                  kdvDebt: tx.kdvDebt * ratio || 0,
                  credit: override.credit !== undefined ? override.credit : tx.credit,
                  date: oDate,
                  dateStr: `${oDate.getDate().toString().padStart(2, '0')}.${(oDate.getMonth() + 1).toString().padStart(2, '0')}.${oDate.getFullYear()}`
              });
          } else {
              modifiedLedger.push(tx);
          }
      });

      // YENİ: Döngüde ÜRETİLMEMİŞ (genelde vadesi gelmemiş GELECEK aya ait) HEDİYE / 0 TL override'ları da
      // ekstreye ekle — böylece "Bu Ay Hediye Edildi" gibi hediye ayları oda dökümündeki gibi caride de görünür.
      // Bakiyeyi şişirmemek için yalnızca hediye/0 TL kayıtlar erken eklenir; borçlu override'lar vadesinde eklenir.
      {
          const __genIds = new Set(ledgerTransactions.map(t => t.id));
          const __custRoomIds = customerRooms.map(r => String(r.id));
          (customer.ledgerOverrides || []).forEach(o => {
              if (!o || o.isDeleted || __genIds.has(o.txId)) return;
              const isGiftLike = o.isSpecificGift === true || (Number(o.debt) || 0) === 0;
              if (!isGiftLike) return;
              const belongs = __custRoomIds.some(rid => String(o.txId).startsWith('debt-' + rid + '-'));
              if (!belongs) return;
              const oDate = o.date ? new Date(o.date) : new Date();
              modifiedLedger.push({
                  id: o.txId,
                  date: oDate,
                  dateStr: `${oDate.getDate().toString().padStart(2, '0')}.${(oDate.getMonth() + 1).toString().padStart(2, '0')}.${oDate.getFullYear()}`,
                  desc: o.desc || 'Bu Ay Hediye Edildi',
                  debt: Number(o.debt) || 0,
                  baseDebt: Number(o.baseDebt) || 0,
                  kdvDebt: Number(o.kdvDebt) || 0,
                  credit: Number(o.credit) || 0
              });
          });
      }

      // 5. Tarihe Göre Sırala
      modifiedLedger.sort((a, b) => a.date - b.date);

      // 6. Gecikme Faizi ve Bakiye (Chronological Loop)
      let finalLedger = [];
      let runningBalance = 0;
      let lastInterestAppliedDate = null;
      const interestRate = Number(collectionRates.interestRate) / 100;
      const addDays = (d, days) => new Date(d.getTime() + days * 86400000);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      // ═══════════════════════════════════════════════════════════════════════
      // YENİ EKLENEN: ÇIKIŞ SONRASI CARİ DONDURMA
      // SORUN: Depodan çıkış yapan müşterilerde gecikme faizi her 30 günde bir
      // işlemeye DEVAM ediyordu. Müşteri aylar önce çıkmış olsa bile bakiyesi
      // kendiliğinden büyüyor, cari hiç sabitlenmiyordu.
      // ÇÖZÜM: Müşterinin AKTİF odası kalmamışsa (tümünden çıkış yapmışsa),
      // en son çıkış tarihi "dondurma anı" kabul edilir. Bu andan SONRASI için
      // yeni faiz ÜRETİLMEZ; bakiye çıkıştaki haliyle sabit kalır.
      // NOT: Çıkıştan ÖNCE doğmuş faizler aynen korunur (silinmez), ayrıca
      // çıkış sonrası yapılan TAHSİLATLAR normal işler — borç kapatılabilsin.
      // ═══════════════════════════════════════════════════════════════════════
      const __activeRooms = rooms.filter(r => r.customerName && r.customerName === customer.name);
      let interestFreezeTime = null;
      if (__activeRooms.length === 0) {
          let __latestExit = 0;
          (customer.roomHistory || []).forEach(h => {
              const _d = parseAnyDate(h?.exitDate);
              if (_d && !isNaN(_d.getTime())) __latestExit = Math.max(__latestExit, _d.getTime());
          });
          if (__latestExit > 0) {
              const _fz = new Date(__latestExit);
              _fz.setHours(23, 59, 59, 999);   // çıkış gününün sonu
              interestFreezeTime = _fz.getTime();
          }
      }

      // GÜNCELLENDİ: Faiz artık AKTİVASYON TARİHİNE bağlı DEĞİL — aktif edildiğinde, müşterinin
      // SON TAHSİLATINDAN (veya ana borcun en son sıfırlandığı andan) itibaren GEÇMİŞE DÖNÜK işler.
      // Kurallar:
      //  • Borcunu TAM kapatan müşterinin kapattığı döneme faiz İŞLENMEZ (lastSettleTime bunu sağlar).
      //  • KISMİ/eksik ödeme yaptıysa: son tahsilat tarihi baz alınır, KALAN bakiyeye o tarihten
      //    30 gün sonra ilk faiz, sonra her 30 günde bir o ayın oranıyla faiz işler (aşağıdaki yeniden-çıpalama).
      //  • Hiç tahsilat yoksa: güncel borç döneminin başından itibaren işler.
      // (Pasife alınınca faiz satırları canlı hesaplandığından otomatik olarak carilerden düşer.)
      const isCustomerExempt = customer.isInterestExempt === true;

      // Ana borcun (faiz hariç) en son sıfırlandığı an — kapatılmış geçmiş dönemler faiz DIŞI kalır.
      // Ayrıca SON TAHSİLAT (credit>0) tarihi de bulunur: kısmi/eksik ödemede faiz, son tahsilattan
      // ÖNCEKİ döneme İŞLEMEZ; yalnızca KALAN bakiyeye son tahsilattan itibaren işler.
      let __principalBal = 0;
      let lastSettleTime = 0;
      let lastPaymentTime = 0;
      modifiedLedger.forEach(t => {
          __principalBal += (Number(t.debt) || 0) - (Number(t.credit) || 0);
          const _td = (t.date instanceof Date) ? t.date : new Date(t.date);
          if (__principalBal <= 0.01) {
              if (!isNaN(_td.getTime())) lastSettleTime = _td.getTime();
          }
          if ((Number(t.credit) || 0) > 0 && !isNaN(_td.getTime())) lastPaymentTime = Math.max(lastPaymentTime, _td.getTime());
      });
      const interestStartTime = Math.max(lastSettleTime, lastPaymentTime);

      // ═══════════════════════════════════════════════════════════════════════════
      // GÜNCELLENDİ: 1 AĞUSTOS 2026 SINIRLI FAİZ KAPISI (ESKİ MANTIĞA DÖNÜŞ + TARİH SINIRI)
      //
      // İŞ KURALI: 1 Ağustos 2026'dan ÖNCE faiz işletilmiyordu; o dönemde tahsilat
      // yapıp borcunu sıfırlayan (veya ödeme yapan) müşteriye "borcun yok" denmişti.
      // Bu yüzden faiz aktif edilince GEÇMİŞE DÖNÜK doğan faizler bu müşterilerin
      // carisine yansımamalı.
      //
      // ÇÖZÜM (eski kapı mantığı, tarih sınırıyla):
      //   • Kapı = 1 Ağustos 2026'dan ÖNCEKİ son tahsilat/son sıfırlama tarihi.
      //     (Eski koddaki Math.max(lastSettleTime, lastPaymentTime) hesabının aynısı,
      //      sadece 1 Ağustos 2026 ÖNCESİ hareketlerle sınırlı.)
      //   • Kapıdan ÖNCE doğan faizler İŞLENMEZ → eski müşterilere geçmiş faiz çıkmaz.
      //   • 1 Ağustos 2026 ve SONRASINDAKİ tahsilatlar/sıfırlamalar kapıyı ARTIK
      //     İLERİ İTMEZ → müşteri 2-4 ay sonra borcunu kısmen ya da tamamen kapatsa
      //     bile, o güne kadar cariye işlenmiş faizler YERİNDE KALIR (silinmez).
      // ═══════════════════════════════════════════════════════════════════════════
      const INTEREST_PROTECT_CUTOFF = new Date(2026, 7, 1).getTime(); // 1 Ağustos 2026 00:00
      let __preCutoffSettle = 0;   // 1 Ağustos 2026 öncesi son SIFIRLAMA (bakiye <= 0)
      let __preCutoffPayment = 0;  // 1 Ağustos 2026 öncesi son TAHSİLAT (credit > 0)
      {
          let __pcBal = 0; // Ana borç bakiyesi (faiz hariç)
          modifiedLedger.forEach(t => {
              const __td = (t.date instanceof Date ? t.date : new Date(t.date)).getTime();
              if (isNaN(__td)) return;
              __pcBal += (Number(t.debt) || 0) - (Number(t.credit) || 0);
              if (__td < INTEREST_PROTECT_CUTOFF) {
                  if (__pcBal <= 0.01) __preCutoffSettle = __td;
                  if ((Number(t.credit) || 0) > 0) __preCutoffPayment = Math.max(__preCutoffPayment, __td);
              }
          });
      }
      // Nihai faiz kapısı: yalnızca 1 Ağustos 2026 ÖNCESİ hareketlerden hesaplanır.
      // Sonraki tahsilatlar kapıyı oynatmadığından, işlenmiş faizler artık silinmez.
      const interestGateTime = Math.max(__preCutoffSettle, __preCutoffPayment);

      // ═══════════════════════════════════════════════════════════════════════════
      // YENİDEN YAZILDI: BORÇ-BAZLI FAİZ MOTORU (HER ÖDEME KENDİ 30 GÜNÜNÜ DOLDURUNCA)
      //
      // ESKİ SORUN: Faiz her 30 günde bir müşterinin TÜM bakiyesine işliyordu.
      // Bakiyeye yeni eklenen bir borç (ikinci deponun kirası, mühür ücreti,
      // nakliye ücreti...) daha 30 günü DOLMADAN faiz kapsamına giriyordu.
      // Örn: 16 gün önce tahakkuk eden Ağustos kirası ve 1 gün önce eklenen
      // mühür ücreti, ertesi günkü faiz vuruşunda faizlendiriliyordu.
      //
      // YENİ KURAL:
      //   • HER BORÇ KALEMİ kendi tarihinden itibaren AYRI izlenir.
      //   • Bir kalem 30 gün içinde ödenmezse, 30. günde KALAN tutarına faiz işler;
      //     ödenmediği sürece her 30 günde bir tekrar işler (o ayın oranıyla).
      //   • 30 günü dolmamış kalemlere ASLA faiz işlemez.
      //   • TAHSİLATLAR en eski borçtan başlayarak kapatır (FIFO). Kalemin
      //     kapanan kısmına bir daha faiz işlemez; kalan kısmına işlemeye devam eder.
      //   • Fazla ödeme (avans) havuzda bekler, sonraki borcu anında düşer.
      //   • Faiz satırları da FIFO ile ödenebilir; ama faize faiz İŞLEMEZ (basit faiz).
      //
      // KORUNAN KURALLAR: faiz aktif/pasif anahtarı, müşteri muafiyeti, ay bazlı
      // oranlar, 1 Ağustos 2026 koruma kapısı (interestGateTime) ve çıkış sonrası
      // dondurma (interestFreezeTime) aynen geçerlidir.
      // ═══════════════════════════════════════════════════════════════════════════
      const _FAR_FUTURE = 8640000000000000;
      const openDebts = [];   // { key, date, remaining, next } — açık borç kalemleri
      let creditPool = 0;     // fazla ödeme (avans) havuzu

      // Faiz vuruş tarihine göre geçerli oranı döndürür (ay bazlı oran > genel oran)
      const _rateFor = (d) => {
          const _k = `${d.getFullYear()}-${d.getMonth()}`;
          const _raw = (collectionRates.monthlyInterestRates || {})[_k];
          return (_raw !== undefined && _raw !== '' && _raw !== null) ? Number(_raw) / 100 : interestRate;
      };

      // Verilen zamana kadar VADESİ GELMİŞ tüm faiz vuruşlarını kronolojik işler.
      const _chargeTicksUpTo = (limitTime) => {
          if (!collectionRates.isInterestActive || isCustomerExempt) return;
          let _safety = 0;
          while (_safety++ < 5000) {
              // Sıradaki en erken vuruş: kalanı olan kalemler içinde en küçük "next"
              let _idx = -1, _min = Infinity;
              openDebts.forEach((d, i) => {
                  if (d.remaining > 0.01 && d.next < _min) { _min = d.next; _idx = i; }
              });
              if (_idx === -1 || _min > limitTime) break;
              const _d = openDebts[_idx];

              // Çıkış sonrası dondurma: dondurma anından sonra vuruş üretilmez
              if (interestFreezeTime && _min > interestFreezeTime) { _d.next = _FAR_FUTURE; continue; }

              // 1 Ağustos 2026 koruma kapısı: kapıdan önceki vuruşlar atlanır (takvim ilerler)
              if (_min >= interestGateTime) {
                  const _tickDate = new Date(_min);
                  const _effRate = _rateFor(_tickDate);
                  const _amt = _d.remaining * _effRate;   // yalnız BU KALEMİN kalanına faiz
                  runningBalance += _amt;
                  // Faiz de ödenebilir bir kalemdir; ama faize faiz işlemez (next = sonsuz)
                  openDebts.push({ key: `${_d.key}-f${_min}`, date: _min, remaining: _amt, next: _FAR_FUTURE });
                  finalLedger.push({
                      id: `interest-${_min}-${_d.key}`,
                      date: _tickDate,
                      dateStr: `${_tickDate.getDate().toString().padStart(2, '0')}.${(_tickDate.getMonth() + 1).toString().padStart(2, '0')}.${_tickDate.getFullYear()}`,
                      desc: `Ekstra Gecikme Faizi (%${(_effRate * 100).toLocaleString('tr-TR')})${_d.srcDesc ? ` — ${_d.srcDesc}` : ''}`,
                      debt: _amt,
                      baseDebt: _amt,
                      kdvDebt: 0,
                      credit: 0,
                      balance: runningBalance,
                      isInterest: true
                  });
              }
              _d.next = _d.next + 30 * 86400000;   // aynı kalem için bir sonraki 30 günlük vade
          }
      };

      // Faiz üretiminin tavanı: bugün (çıkış yapmış müşteride çıkış günü)
      const _interestHorizon = interestFreezeTime ? Math.min(today.getTime(), interestFreezeTime) : today.getTime();

      modifiedLedger.forEach(tx => {
          const _txTime = (tx.date instanceof Date ? tx.date : new Date(tx.date)).getTime();
          // Önce bu işlem tarihine kadar vadesi gelen faizleri işle (kronolojik sıra korunur)
          _chargeTicksUpTo(Math.min(_txTime, _interestHorizon));

          // BORÇ: yeni kalem olarak izlemeye al. Avans havuzu varsa borcu anında düşer.
          if ((Number(tx.debt) || 0) > 0.001 && !tx.isInterest) {
              let _amt = Number(tx.debt);
              if (creditPool > 0.01) {
                  const _use = Math.min(creditPool, _amt);
                  creditPool -= _use; _amt -= _use;
              }
              openDebts.push({
                  key: String(tx.id || `d${_txTime}`),
                  date: _txTime,
                  remaining: _amt,
                  next: _txTime + 30 * 86400000,   // İLK faiz vadesi: kalemin 30. günü
                  srcDesc: (tx.desc || '').length > 45 ? (tx.desc || '').slice(0, 45) + '…' : (tx.desc || '')
              });
          }

          // TAHSİLAT: en eski borçtan başlayarak kapat (FIFO); artan avans havuzuna
          if ((Number(tx.credit) || 0) > 0.001) {
              let _pay = Number(tx.credit);
              const _sorted = openDebts.filter(d => d.remaining > 0.01).sort((a, b) => a.date - b.date);
              for (const d of _sorted) {
                  if (_pay <= 0.01) break;
                  const _use = Math.min(d.remaining, _pay);
                  d.remaining -= _use; _pay -= _use;
              }
              if (_pay > 0.01) creditPool += _pay;
          }

          runningBalance += ((Number(tx.debt) || 0) - (Number(tx.credit) || 0));
          finalLedger.push({ ...tx, balance: runningBalance });
      });

      // Son işlemden bugüne kadar vadesi gelmiş faizleri de işle
      _chargeTicksUpTo(_interestHorizon);

      return { ledger: finalLedger, balance: runningBalance };
  };

  let customerTotalBalance = 0;
  if (selectedRoomDetail?.customerName) {
      const customer = customers.find(c => c.name === selectedRoomDetail.customerName);
      if (customer) {
          const { balance } = getCustomerLedger(customer);
          customerTotalBalance = balance;
      }
  }

  // ============== YENİ: EK GÖSTERGE KARTLARI + ROL BAZLI GÖRÜNÜM ==============
  // Yeni 5 kartın metrikleri. Performans için yalnızca Gösterge Paneli açıkken hesaplanır.
  // (getCustomerLedger'dan SONRA tanımlanmalı — cari borç hesabı ona bağlıdır.)
  const extraCardStats = (() => {
      if (activeMenu !== 'dashboard') return { sembolCount: 0, sembolGetirenCount: 0, sembolCikisCount: 0, sembolToplam: 0, sembolPct: 0, debtorCount: 0, debtorPct: 0, todayEntryRooms: 0, todayEntryPct: 0, invoicedCount: 0, invoicedPct: 0, legalCount: 0, legalPct: 0, apptCount: 0 };

      // 1) Sembol Nakliyat ile getiren müşteriler — zaman filtresine (dashboardRange) tabidir.
      //    Yüzde: aynı aralıkta giriş yapmış tüm müşterilere göre.
      const rangeRooms = rooms.filter(r => r.customerName && (dashboardRange === 'all' ? true : inDashboardRange(parseAnyDate(r.entryDate), dashboardRange)));
      const sembolCustomerSet = new Set(rangeRooms.filter(r => r.broughtBy === 'sembol').map(r => r.customerName));
      const rangeCustomerSet = new Set(rangeRooms.map(r => r.customerName));
      const sembolGetirenCount = sembolCustomerSet.size;
      const sembolPct = rangeCustomerSet.size > 0 ? Math.round((sembolGetirenCount / rangeCustomerSet.size) * 100) : 0;

      // YENİ: Sembol Nakliyat ile ÇIKIŞ yapılanlar — oda geçmişindeki (history) exitBy==='sembol' kayıtları,
      //       çıkış tarihine göre dashboardRange filtresiyle. Tüm odaların history'si taranır.
      let sembolCikisCount = 0;
      rooms.forEach(r => {
          (r.history || []).forEach(h => {
              if (h.exitBy === 'sembol' && (dashboardRange === 'all' ? true : inDashboardRange(parseAnyDate(h.exitDate), dashboardRange))) {
                  sembolCikisCount++;
              }
          });
      });
      const sembolToplam = sembolGetirenCount + sembolCikisCount;
      // Kartta gösterilecek değer, seçili moda göre
      const sembolCount = sembolCardMode === 'cikis' ? sembolCikisCount : (sembolCardMode === 'toplam' ? sembolToplam : sembolGetirenCount);

      // 2) Cari borcu olan müşteriler — yüzde, MEVCUT ODASI OLAN müşteri sayısına göre.
      const roomOwnerSet = new Set(rooms.filter(r => r.customerName).map(r => r.customerName));
      let debtorCount = 0;
      customers.forEach(c => {
          try { const { balance } = getCustomerLedger(c); if (balance > 0) debtorCount++; } catch (e) { /* hesap hatasında müşteri atlanır */ }
      });
      const debtorPct = roomOwnerSet.size > 0 ? Math.round((debtorCount / roomOwnerSet.size) * 100) : 0;

      // 3) Giriş tarihi BUGÜN olan odalar — yüzde, dolu oda sayısına göre.
      const now = new Date();
      const doluOdalar = rooms.filter(r => r.customerName);
      const todayEntryRooms = doluOdalar.filter(r => { const d = parseAnyDate(r.entryDate); return d && d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
      const todayEntryPct = doluOdalar.length > 0 ? Math.round((todayEntryRooms / doluOdalar.length) * 100) : 0;

      // 4) Fatura kesilmiş cariler — yüzde, tüm müşterilere göre.
      const invoicedCount = customers.filter(c => (c.invoices || []).length > 0).length;
      const invoicedPct = customers.length > 0 ? Math.round((invoicedCount / customers.length) * 100) : 0;

      // 5) İcra sürecindeki odalar — yüzde, TÜM odalara göre.
      const legalCount = rooms.filter(r => r.isUnderLegalAction).length;
      const legalPct = rooms.length > 0 ? Math.round((legalCount / rooms.length) * 100) : 0;

      // 6) Takvimdeki randevular — seçili zaman aralığına (dashboardRange) göre toplam randevu sayısı.
      const apptCount = appointments.filter(a => {
          if (dashboardRange === 'all') return true;
          return inDashboardRange(parseAnyDate(a.date), dashboardRange);
      }).length;

      return { sembolCount, sembolGetirenCount, sembolCikisCount, sembolToplam, sembolPct, debtorCount, debtorPct, todayEntryRooms, todayEntryPct, invoicedCount, invoicedPct, legalCount, legalPct, apptCount };
  })();

  // Yeni 5 kart (id 9-13). Mevcut kartlarla aynı görsel yapıyı kullanır; tag alanında yüzdelik pay gösterilir.
  const extraDashboardCards = [
      { id: 9, title: 'SEMBOL NAKLİYAT', value: extraCardStats.sembolCount.toString(), desc: sembolCardMode === 'cikis' ? `${rangeLabel} Sembol Nakliyat ile çıkış yapılanlar` : (sembolCardMode === 'toplam' ? `${rangeLabel} Sembol Nakliyat toplam (getiren + çıkış)` : `${rangeLabel} Sembol Nakliyat ile eşya getiren müşteriler`), tag: sembolCardMode === 'getiren' ? `Girişlerin %${extraCardStats.sembolPct} payı` : (sembolCardMode === 'cikis' ? 'Sembol ile çıkış' : 'Getiren + Çıkış'), tagColor: 'text-teal-700 bg-teal-100', borderColor: 'border-teal-500', iconColor: 'text-teal-500 bg-teal-50', icon: Box, chartData: [8, 12, 10, 15, 14, 18, 20], chartColor: '#14b8a6', sembolSegment: true },
      { id: 10, title: 'CARİ BORCU OLAN MÜŞTERİ', value: extraCardStats.debtorCount.toString(), desc: 'Carisinde ödenmemiş borcu bulunan müşteriler', tag: `Odası olanların %${extraCardStats.debtorPct} payı`, tagColor: 'text-red-700 bg-red-100', borderColor: 'border-red-500', iconColor: 'text-red-500 bg-red-50', icon: Wallet, chartData: [15, 14, 16, 13, 15, 12, 14], chartColor: '#ef4444' },
      { id: 11, title: 'BUGÜN GİRİŞ YAPILAN ODA', value: extraCardStats.todayEntryRooms.toString(), desc: 'Giriş tarihi bugün olan odalar', tag: `Dolu odaların %${extraCardStats.todayEntryPct} payı`, tagColor: 'text-indigo-700 bg-indigo-100', borderColor: 'border-indigo-500', iconColor: 'text-indigo-500 bg-indigo-50', icon: Calendar, chartData: [2, 4, 3, 6, 5, 7, 8], chartColor: '#6366f1' },
      { id: 12, title: 'FATURA KESİLMİŞ CARİ', value: extraCardStats.invoicedCount.toString(), desc: 'En az bir e-fatura kesilmiş müşteriler', tag: `Tüm carilerin %${extraCardStats.invoicedPct} payı`, tagColor: 'text-purple-700 bg-purple-100', borderColor: 'border-purple-500', iconColor: 'text-purple-500 bg-purple-50', icon: FileTextIcon, chartData: [10, 12, 14, 13, 16, 18, 19], chartColor: '#a855f7' },
      { id: 13, title: 'İCRADA OLAN ODA', value: extraCardStats.legalCount.toString(), desc: 'Yasal takip (icra) sürecindeki odalar', tag: `Tüm odaların %${extraCardStats.legalPct} payı`, tagColor: 'text-rose-700 bg-rose-100', borderColor: 'border-rose-600', iconColor: 'text-rose-600 bg-rose-50', icon: Shield, chartData: [3, 3, 4, 3, 5, 4, 4], chartColor: '#e11d48' },
      { id: 14, title: 'TAKVİM RANDEVU SAYISI', value: extraCardStats.apptCount.toString(), desc: `${rangeLabel} takvimdeki toplam randevu`, tag: 'Randevu takvimi', tagColor: 'text-amber-700 bg-amber-100', borderColor: 'border-amber-500', iconColor: 'text-amber-500 bg-amber-50', icon: Calendar, chartData: [4, 6, 5, 8, 7, 9, 11], chartColor: '#f59e0b' }
  ];

  // ROL BAZLI KART GÖRÜNÜMÜ:
  // - Yönetici: TÜM kartlar (id 14 Takvim Randevu dahil)
  // - Muhasebe: Cari Borcu Olan, Bugün Giriş Yapılan Oda, Fatura Kesilmiş Cari, İcrada Olan Oda
  // - Depo Sorumlusu: Kaydedilen Müşteri, Giren Oda, Çıkan Oda, Boş Oda, Giriş-Çıkış Yapan Müşteriler, Takvim Randevu
  // - Satış Sorumlusu: Sembol Nakliyat Müşterisi, Kaydedilen Müşteri, Giren Oda, Çıkan Oda, Boş Oda, Takvim Randevu
  // Rol eşleşmesi ad/kod içinde arama ile yapılır (örn. "Depo Sorumlusu", "depo-sorumlusu" gibi roller yakalanır).
  const dashboardRoleKey = (() => {
      const r = getCurrentRole();
      if (!r || r.isSuper) return 'yonetici';
      const n = normalizeStr((r.code || '') + ' ' + (r.name || ''));
      if (n.includes('muhasebe')) return 'muhasebe';
      if (n.includes('depo')) return 'depo';
      if (n.includes('satis')) return 'satis';
      return 'satis'; // Tanımsız/diğer roller en dar operasyonel seti görür
  })();
  const roleCardIds = {
      yonetici: null, // null = tüm kartlar
      muhasebe: [10, 11, 12, 13],
      depo: [1, 3, 4, 8, 5, 14],
      satis: [9, 1, 3, 4, 8, 14]
  };
  const allDashboardCards = [...dashboardCards, ...extraDashboardCards];
  const visibleDashboardCards = roleCardIds[dashboardRoleKey]
      ? roleCardIds[dashboardRoleKey].map(id => allDashboardCards.find(c => c.id === id)).filter(Boolean)
      : allDashboardCards;
  // ============================================================================

  const getRoomStats = (blockId) => {
    const blockRooms = rooms.filter(r => r.blockId === blockId);
    let empty = 0; let full = 0; let reserved = 0;
    blockRooms.forEach(oda => {
      const isValidReservation = oda.isReserved && (!oda.reserveExpiryTimestamp || oda.reserveExpiryTimestamp > Date.now());
      if (oda.customerName) full++;
      else if (isValidReservation) reserved++;
      else empty++;
    });
    return { empty, full, reserved };
  };

  const getWarehouseStats = (warehouseId) => {
    const whBlocks = blocks.filter(b => b.warehouseId === warehouseId);
    let empty = 0; let full = 0; let reserved = 0;
    whBlocks.forEach(b => {
      const stats = getRoomStats(b.id);
      empty += stats.empty; full += stats.full; reserved += stats.reserved;
    });
    return { empty, full, reserved };
  };

  // GÜNCELLENDİ: Kapasite/doluluk toplamları da odaların YUVARLANMIŞ m³ değerinden hesaplanır.
  // Böylece kartlarda görünen tam sayılar ile şube toplamları birebir tutar (küsurat farkı oluşmaz).
  const _roomM3 = (room) => roundRoomM3(room?.m3 || 0);
  const getBlockCapacityM3 = (blockId) => rooms.filter(r => r.blockId === blockId).reduce((sum, room) => sum + _roomM3(room), 0);
  const getWarehouseCapacityM3 = (warehouseId) => {
    const whBlockIds = blocks.filter(b => b.warehouseId === warehouseId).map(b => b.id);
    return rooms.filter(r => whBlockIds.includes(r.blockId)).reduce((sum, room) => sum + _roomM3(room), 0);
  };
  const getBlockOccupiedM3 = (blockId) => rooms.filter(r => r.blockId === blockId && (r.customerName || (r.isReserved && (!r.reserveExpiryTimestamp || r.reserveExpiryTimestamp > Date.now())))).reduce((sum, room) => sum + _roomM3(room), 0);
const getWarehouseOccupiedM3 = (warehouseId) => {
    const whBlockIds = blocks.filter(b => b.warehouseId === warehouseId).map(b => b.id);
    return rooms.filter(r => whBlockIds.includes(r.blockId) && (r.customerName || (r.isReserved && (!r.reserveExpiryTimestamp || r.reserveExpiryTimestamp > Date.now())))).reduce((sum, room) => sum + _roomM3(room), 0);
  };

  // ==========================================
  // YEDEKLEME FONKSİYONLARI
  // ==========================================
  const handleExportJSON = () => {
    const backupData = { customers, warehouses, blocks, rooms };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `depoevim_yedek_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        console.log("İçe aktarılacak veriler:", importedData);
        alert("Dosya başarıyla okundu! Yüklenen veriler konsolda görünüyor.");
      } catch (error) {
        alert("Geçersiz JSON dosyası!");
      }
    };
    reader.readAsText(file);
  };
  // ==========================================

  // YENİ: İLK AÇILIŞ "YÜKLENİYOR" EKRANI — Depoevim logosu soluktan canlıya animasyonla;
  // Firebase verileri gelene kadar gösterilir, veriler tam gelince uygulama açılır.
  if (!appDataReady) {
      return (
          <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center">
              <style>{`
                @keyframes depoLogoPulse {
                  0%   { filter: grayscale(100%) brightness(1.15); opacity: 0.30; transform: scale(0.97); }
                  50%  { filter: grayscale(0%) brightness(1);      opacity: 1;    transform: scale(1.03); }
                  100% { filter: grayscale(100%) brightness(1.15); opacity: 0.30; transform: scale(0.97); }
                }
                @keyframes depoBarSlide { 0% { transform: translateX(-100%);} 100% { transform: translateX(250%);} }
              `}</style>
              <img
                  src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp"
                  alt="Depoevim"
                  style={{ height: '70px', objectFit: 'contain', animation: 'depoLogoPulse 1.6s ease-in-out infinite' }}
              />
              <div className="mt-8 w-52 h-1.5 rounded-full bg-gray-100 overflow-hidden relative">
                  <div className="absolute top-0 left-0 h-full w-2/5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500" style={{ animation: 'depoBarSlide 1.3s ease-in-out infinite' }}></div>
              </div>
              <p className="mt-5 text-sm font-bold text-slate-400 tracking-wide">Yükleniyor...</p>
          </div>
      );
  }

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4" style={{ backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 sm:p-10 border border-gray-100 animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
                  {/* Top Color Accents */}
                  <div className="absolute top-0 left-0 right-0 flex h-1.5">
                      <div className="w-1/2 bg-orange-500"></div>
                      <div className="w-1/2 bg-blue-500"></div>
                  </div>
                  
                  <div className="text-center mb-10 mt-2">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-50 mb-4 shadow-sm border border-gray-100 overflow-hidden">
                          <img src="https://www.depoevim.com/wp-content/uploads/2026/01/depoevim_favicon2.webp" alt="Depoevim" className="w-10 h-10 object-contain" />
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" className="h-9 object-contain" />
                        <span className="text-sm text-gray-400 font-bold uppercase tracking-widest align-middle">CRM</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-2 font-medium">Yönetim paneline hoş geldiniz, lütfen giriş yapın.</p>
                  </div>

                  <form onSubmit={handleLogin} className="flex flex-col gap-5">
                      {loginError && (
                          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 border border-red-100 animate-pulse">
                              <AlertCircle size={16} /> {loginError}
                          </div>
                      )}
<div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-wider pl-1">Kullanıcı Adı</label>
                          <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><UserCog size={18} className="text-gray-400" /></div>
                              <input type="text" value={loginData.username} onChange={(e) => setLoginData({...loginData, username: e.target.value})} placeholder="admin" className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all font-semibold text-slate-700" required />
                          </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-gray-600 uppercase tracking-wider pl-1">Şifre</label>                          <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                              </div>
                              <input type="password" value={loginData.password} onChange={(e) => setLoginData({...loginData, password: e.target.value})} placeholder="••••••••" className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all font-semibold text-slate-700" required />
                          </div>
                      </div>

                      {/* YENİ EKLENDİ: Beni Hatırla Kutucuğu */}
                      <div className="flex items-center justify-between mt-1 px-1">
                          <label className="flex items-center gap-2 cursor-pointer group">
                              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 transition-all" />
                              <span className="text-xs font-bold text-gray-600 group-hover:text-blue-600 transition-colors">Beni Hatırla</span>
                          </label>
                      </div>

                      <button type="button" onClick={handleLogin} className="mt-2 bg-blue-600 hover:bg-blue-700 text-white w-full py-3.5 rounded-xl font-bold text-base shadow-lg shadow-blue-500/30 transition-all transform hover:-translate-y-0.5">
                          Sisteme Giriş Yap
                      </button>
                  </form>
                  
                  <div className="mt-8 pt-6 border-t border-gray-100 text-center flex flex-col items-center gap-1">
                      <p className="text-[11px] text-gray-400 font-medium">Depoevim CRM Sistemi © {new Date().getFullYear()}</p>
                      <p className="text-[10px] text-gray-400">Gizlilik & Güvenlik Politikası</p>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 flex bg-slate-50 font-sans overflow-hidden">
      {/* YENİ EKLENEN: SENKRON ENGELİ UYARI ŞERİDİ + "TEKRAR YÜKLE" BUTONU
          Kayıtlar sunucuya ulaşmıyorsa kullanıcı ARTIK GÖRÜR ve tek tuşla yeniden
          göndermeyi deneyebilir. Kuyruk boşalınca şerit otomatik kaybolur.
          Şerit kompakt tutuldu; üstteki arama/menü çubuğunu kapatmaz. */}
      {(syncBlocked || syncRetryMsg) && (
        <div className={`fixed top-0 left-0 right-0 z-[100] px-3 py-2 shadow-lg ${syncBlocked ? 'bg-red-600' : 'bg-emerald-600'} text-white`}>
          <div className="flex items-center gap-2 max-w-5xl mx-auto">
            <AlertCircle size={16} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold leading-tight">
                {syncBlocked
                  ? `${syncPendingCount > 0 ? syncPendingCount + ' kayıt' : 'Bazı kayıtlar'} sunucuya yüklenemedi — diğer kullanıcılar göremiyor.`
                  : 'Senkronizasyon durumu'}
              </p>
              {/* Deneme sırasındaki/sonrasındaki durum mesajı */}
              {syncRetryMsg && <p className="text-[11px] opacity-90 leading-tight mt-0.5">{syncRetryMsg}</p>}
            </div>
            {/* TEKRAR YÜKLE: takılı kayıtları elle yeniden gönderir */}
            {syncBlocked && (
              <button
                onClick={handleRetrySync}
                disabled={syncRetrying}
                className="shrink-0 flex items-center gap-1.5 bg-white text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-wait px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-sm transition-colors"
                title="Sunucuya yüklenemeyen kayıtları tekrar gönder"
              >
                <RefreshCcw size={14} className={syncRetrying ? 'animate-spin' : ''} />
                {syncRetrying ? 'Yükleniyor...' : 'Tekrar Yükle'}
              </button>
            )}
          </div>
        </div>
      )}
      {isSidebarOpen && <div className="fixed inset-0 bg-gray-800/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}/>}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} lg:relative h-full`}>
        <div className="h-16 flex items-center px-6 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 text-xl font-bold text-slate-800"><img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" className="h-7 object-contain" /><span className="text-xs text-gray-400 font-normal ml-1">CRM</span></div>
          <button className="ml-auto lg:hidden p-1" onClick={() => setIsSidebarOpen(false)}><X size={24} className="text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-4 scrollbar-thin min-h-0">
          <nav className="space-y-2 px-3 pb-8">
            {menuItems.filter(item => hasPerm('mainMenus', item.permId)).map((item) => {
              const hasActiveSub = item.subItems?.some(sub => sub.id === activeMenu);
              // Alt öğeleri de izne göre süz (izin verilmeyen sayfalar gizlenir)
              const visibleSubs = item.subItems ? item.subItems.filter(sub => !sub.permId || sub.action || hasPerm('pages', sub.permId)) : null;

              return visibleSubs ? (
                <div key={item.id} className={`w-full border rounded-xl shadow-sm transition-all ${hasActiveSub ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 bg-white'} p-1`}>
                  <button onClick={() => {
                    // Sadece menüyü aç/kapat (sayfa değiştirmeden)
                    setOpenSubMenus(prev => ({...prev, [item.id]: !prev[item.id]}));
                  }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${hasActiveSub ? 'text-orange-700 hover:bg-orange-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                    <div className="flex items-center gap-3"><item.icon size={18} className={hasActiveSub ? 'text-orange-600' : 'text-gray-400'} />{item.label}</div>
                    <ChevronDown size={16} className={`${hasActiveSub ? 'text-orange-600' : 'text-gray-400'} transition-transform ${openSubMenus[item.id] ? 'rotate-180' : ''}`} />
                  </button>
                  {openSubMenus[item.id] && (
                    <div className="mt-1 mb-1 space-y-1">
                      {visibleSubs.map(sub => {
                        const isSubActive = sub.id === activeMenu;
                        
                        let buttonClass = '';
                        let layoutClass = 'w-full pl-10 pr-3 py-2 rounded-lg text-sm';
                        
                        if (sub.id === 'odeme-girisi') {
                            // Butonun genişliğini, yüksekliğini ve padding'ini küçültüyoruz
                            layoutClass = 'w-[85%] ml-auto mr-3 pl-3 pr-2 py-1.5 rounded-md text-[13px] my-1';
                            buttonClass = isSubActive 
                                ? 'bg-[#1bc5bd] text-white shadow-md font-bold' 
                                : 'bg-teal-50/50 text-teal-700 border border-teal-200 hover:bg-teal-100/50 hover:border-teal-300 font-bold shadow-sm';
                        } else if (sub.id === 'depo-odemeleri-guncelle') {
                            layoutClass = 'w-[85%] ml-auto mr-3 pl-3 pr-2 py-2 rounded-md text-[13px] mt-3 mb-1';
                            buttonClass = 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30 font-bold hover:from-purple-700 hover:to-indigo-700 transition-all';
                        } else {
                            buttonClass = isSubActive 
                                ? 'bg-orange-50 text-orange-600' 
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900';
                        }

                        return (
                          <button key={sub.id} onClick={() => { if (sub.action) { sub.action(); } else { setActiveMenu(sub.id); setSelectedCustomerId(null); setIsSidebarOpen(false); } }} className={`flex items-center justify-between text-left transition-colors font-medium ${layoutClass} ${buttonClass}`}>
                            {sub.label}
                            {sub.id === 'odeme-girisi' && <Plus size={14} className={isSubActive ? 'text-white' : 'text-teal-600'} />}
                            {sub.id === 'depo-odemeleri-guncelle' && <RefreshCcw size={14} className="text-white" />}
                            {/* YENİ: Hatırlatmalarda günü gelmiş/geçmiş ve tamamlanmamış kayıt varsa yanıp sönen bildirim ışığı */}
                            {sub.id === 'hatirlatmalar' && (() => {
                                const _t = new Date().toISOString().split('T')[0];
                                const _due = reminders.filter(r => !r.completed && r.date && r.date <= _t).length;
                                if (_due === 0) return null;
                                return (
                                  <span className="ml-auto relative flex h-5 min-w-[20px] items-center justify-center shrink-0">
                                     <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                                     <span className={`relative inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold ${isSubActive ? 'bg-white text-red-600' : 'bg-red-500 text-white'}`}>{_due}</span>
                                  </span>
                                );
                            })()}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <button key={item.id} onClick={() => { 
                    setActiveMenu(item.id); 
                    setSelectedCustomerId(null); 
                    setIsSidebarOpen(false); 
                    if (item.id === 'depo') {
                      // Depo menüsüne (veya alt menüsüz ana öğelere) tıklandığında alt seçimleri sıfırlayarak ana bölüme dön
                      setSelectedWarehouseId(null);
                      setSelectedBlockId(null);
                      setSelectedRoomId(null);
                      // YENİ: Özel görünümler (boyut arama / rezerve listesi) de kapatılır
                      setActiveSizeFilter(null);
                      setSizeFilterScope(null);
                      setShowReservedView(false);
                      setReservedViewScope(null);
                    }
                }} className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-xl shadow-sm transition-colors text-sm font-medium ${activeMenu === item.id && !selectedCustomerId ? 'border-orange-200 bg-orange-50 text-orange-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                  <item.icon size={18} className={activeMenu === item.id ? 'text-orange-500' : 'text-gray-400'} />{item.label}
                  {/* YENİ: Takvim'de yaklaşan randevu varsa, sayısıyla birlikte yanıp sönen bildirim rozeti */}
                  {item.id === 'takvim' && upcomingAppointmentsCount > 0 && (
                     <span className="ml-auto relative flex h-5 min-w-[20px] items-center justify-center shrink-0">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                        <span className="relative inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{upcomingAppointmentsCount}</span>
                     </span>
                  )}
                  {/* YENİ: Hatırlatmalarda günü gelmiş/geçmiş ve tamamlanmamış kayıt varsa yanıp sönen bildirim ışığı */}
                  {item.id === 'hatirlatmalar' && (() => {
                      const _t = new Date().toISOString().split('T')[0];
                      const _due = reminders.filter(r => !r.completed && r.date && r.date <= _t).length;
                      if (_due === 0) return null;
                      return (
                         <span className="ml-auto relative flex h-5 min-w-[20px] items-center justify-center shrink-0">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                            <span className="relative inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{_due}</span>
                         </span>
                      );
                  })()}
                </button>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 lg:px-8 z-30 relative gap-2 sm:gap-4">
          <div className="flex items-center shrink-0 lg:hidden">
            <button className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100" onClick={() => setIsSidebarOpen(true)}><Menu size={22} /></button>
          </div>
          
          <div className="flex-1 max-w-md w-full relative z-40 flex items-center justify-center">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none"><Search size={16} className="text-gray-400" /></div>
              <input 
                 type="text" 
                 placeholder="Ara: Ad, No, Oda..." 
                 value={globalSearchTerm}
                 onChange={(e) => {
                     setGlobalSearchTerm(e.target.value);
                     setShowGlobalSearchResults(e.target.value.length > 0);
                 }}
                 onFocus={() => {
                     if (globalSearchTerm.length > 0) setShowGlobalSearchResults(true);
                 }}
                 className="block w-full pl-8 sm:pl-10 pr-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg text-xs sm:text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-gray-50 relative z-50"
              />
              
              {showGlobalSearchResults && (
                 <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowGlobalSearchResults(false)}></div>
                    <div className="absolute top-full left-0 sm:left-0 lg:left-0 mt-2 w-[85vw] sm:w-[500px] max-w-full max-h-[400px] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-2xl z-50">
                        <div className="p-3 border-b border-gray-100 bg-gray-50 sticky top-0 flex justify-between items-center z-10">
                            <span className="text-xs font-bold text-gray-500 uppercase">Arama Sonuçları</span>
                            <button onClick={() => setShowGlobalSearchResults(false)} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
                        </div>
{(() => {
                            const term = normalizeStr(globalSearchTerm);
                            const results = customers.map(c => {
                                const cRooms = rooms.filter(r => r.customerName === c.name);
                                return { customer: c, rooms: cRooms };
                            }).filter(item => {
                                const matchName = normalizeStr(item.customer.name).includes(term);
                                const matchNo = item.customer.customerNo?.includes(term);
                                const matchPhone = item.customer.phone?.includes(term);
                                const matchRoom = item.rooms.some(r => normalizeStr(r.name).includes(term));
                                // YENİ: Vekalet eden kişi (vekil) ad / TC / telefon üzerinden de arama — vekil adı yazınca müşterinin carisi/odası bulunur
                                const matchProxy = normalizeStr(item.customer.proxyName || '').includes(term) || (item.customer.proxyTc || '').includes(term) || (item.customer.proxyPhone || '').includes(term);
                                return matchName || matchNo || matchPhone || matchRoom || matchProxy;
                            });

                            // YENİ: Boş oda araması — müşterisi olmayan ve rezerve olmayan odalar arasında ad eşleşmesi
                            const emptyRooms = rooms.filter(r => {
                                if (r.customerName) return false; // dolu odalar hariç
                                return normalizeStr(r.name).includes(term);
                            });

                            if (results.length === 0 && emptyRooms.length === 0) return <div className="p-6 text-center text-sm text-gray-500 font-medium">Aranan kriterlere uygun müşteri veya oda bulunamadı.</div>;

                            return (
                                <ul className="divide-y divide-gray-100">
                                    {results.map((item, idx) => (
                                        <li key={idx} className="p-4 hover:bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
                                            <div className="flex-1 min-w-0 w-full">
                                                <div className="font-bold text-gray-800 text-sm truncate">{item.customer.name}</div>
                                                <div className="text-[10px] text-gray-500 flex flex-wrap gap-2 mt-1">
                                                    <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-semibold text-gray-600">No: {item.customer.customerNo}</span>
                                                    <span className="flex items-center gap-0.5 font-medium"><Phone size={10}/> {item.customer.phone}</span>
                                                    {/* YENİ: Vekil adı/TC/telefonu aranan terimle eşleşiyorsa vekil bilgisini göster */}
                                                    {item.customer.proxyName && (normalizeStr(item.customer.proxyName).includes(normalizeStr(globalSearchTerm)) || (item.customer.proxyTc || '').includes(normalizeStr(globalSearchTerm)) || (item.customer.proxyPhone || '').includes(normalizeStr(globalSearchTerm))) && (
                                                        <span className="flex items-center gap-0.5 font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100"><Shield size={10}/> Vekil: {item.customer.proxyName}</span>
                                                    )}
                                                    {item.rooms.length > 0 && (
                                                        <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 truncate">
                                                            Oda: {item.rooms.map(r=>r.name).join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex sm:flex-col gap-1.5 shrink-0 w-full sm:w-28 mt-2 sm:mt-0">
                                                <a href={`#m=tum-musteriler&c=${item.customer.id}`} onClick={(e) => handleNavClick(e, () => {
                                                    setSelectedCustomerId(item.customer.id);
                                                    setActiveMenu('tum-musteriler');
                                                    setShowGlobalSearchResults(false);
                                                    setGlobalSearchTerm('');
                                                })} className="text-[10px] bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm flex-1 sm:w-full no-underline">
                                                    <Settings size={12}/> Cariye Git
                                                </a>
                                                
                                                {item.rooms.length > 0 && (
                                                    <button onClick={() => {
                                                        const firstRoom = item.rooms[0];
                                                        const block = blocks.find(b => b.id === firstRoom.blockId);
                                                        if (block) {
                                                            setSelectedWarehouseId(block.warehouseId);
                                                            setSelectedBlockId(firstRoom.blockId);
                                                            setSelectedRoomId(firstRoom.id);
                                                            setSelectedCustomerId(null);
                                                            setActiveMenu('depo');
                                                            setShowGlobalSearchResults(false);
                                                            setGlobalSearchTerm('');
                                                        }
                                                    }} className="text-[10px] bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm flex-1 sm:w-full">
                                                        <Box size={12}/> Odasına Git
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}

                                    {/* YENİ: Boş oda sonuçları — "Boş Oda Git" ile doğrudan o odanın "Bu Oda Şu An Boş" ekranına gider */}
                                    {emptyRooms.map((room) => {
                                        const block = blocks.find(b => b.id === room.blockId);
                                        const wh = block ? warehouses.find(w => w.id === block.warehouseId) : null;
                                        const goToRoom = () => {
                                            if (!block) return;
                                            setSelectedWarehouseId(block.warehouseId);
                                            setSelectedBlockId(room.blockId);
                                            setSelectedRoomId(room.id);
                                            setSelectedCustomerId(null);
                                            setActiveMenu('depo');
                                            setShowGlobalSearchResults(false);
                                            setGlobalSearchTerm('');
                                        };
                                        return (
                                            <li key={`empty-${room.id}`} className="p-4 hover:bg-teal-50/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
                                                <div className="flex-1 min-w-0 w-full">
                                                    <div className="font-bold text-gray-800 text-sm truncate flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                                                        {room.name} <span className="text-teal-600 text-[10px] font-bold bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">BOŞ ODA</span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 flex flex-wrap gap-2 mt-1">
                                                        {wh && <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 font-semibold text-gray-600">{wh.name}{block ? ' - ' + block.name : ''}</span>}
                                                        {room.m3 ? <span className="font-medium">{room.m3} m³</span> : null}
                                                    </div>
                                                </div>
                                                <div className="flex sm:flex-col gap-1.5 shrink-0 w-full sm:w-28 mt-2 sm:mt-0">
                                                    <button onClick={goToRoom} className="text-[10px] bg-[#1bc5bd] hover:bg-teal-600 text-white px-3 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm w-full">
                                                        <Box size={12}/> Boş Oda Git
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            );
                        })()}
                    </div>
                 </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4 shrink-0">
            <button className="p-1 sm:p-2 text-gray-400 hover:text-gray-500 relative hidden sm:block"><Bell size={18} /><span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" /></button>
            <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
            
            <div className="relative">
                <button onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)} className="flex items-center gap-2 hover:bg-gray-50 p-1 sm:p-1.5 rounded-lg transition-colors">
                  {currentUserProfile.avatar ? (
                      <img src={currentUserProfile.avatar} alt="Profile" className="h-7 w-7 sm:h-8 sm:w-8 rounded-full object-cover border border-gray-200 shadow-sm" />
                  ) : (
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-sm">
                          {currentUserProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                  )}
                  <div className="hidden md:block text-left"><p className="text-sm font-medium text-gray-700 leading-none">{currentUserProfile.name}</p><p className="text-xs text-gray-500 mt-1">{currentUserProfile.role}</p></div>
                  <ChevronDown size={16} className={`text-gray-400 hidden sm:block transition-transform ${isProfileDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isProfileDropdownOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsProfileDropdownOpen(false)}></div>
                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                            <div className="p-3 border-b border-gray-50 md:hidden bg-gray-50/50">
                                <p className="text-sm font-bold text-gray-800">{currentUserProfile.name}</p>
                                <p className="text-xs font-semibold text-orange-600 mt-0.5">{currentUserProfile.role}</p>
                            </div>
                            <button onClick={() => { setIsProfileModalOpen(true); setIsProfileDropdownOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1bc5bd] flex items-center gap-2 font-bold transition-colors">
                                <UserCog size={16} className="text-gray-400"/> Profil Ayarları
                            </button>
                            <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-bold transition-colors border-t border-gray-50">
                                <LogOut size={16} className="text-red-400"/> Çıkış Yap
                            </button>
                        </div>
                    </>
                )}
            </div>
          </div>
        </header>

        <main ref={mainScrollRef} onScroll={handleMainScroll} className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 w-full block scroll-smooth relative">
          {(() => {
             // YENİ EKLENEN: Aktif sayfaya erişim izni kontrolü (süper yönetici hariç)
             if (currentRoleIsSuper()) return null;
             // YENİ EKLENEN: AVUKAT İSTİSNASI — İcra Odaları ekranından "Carisine Git" ile
             // AÇILAN bir müşterinin cari ekranı avukata gösterilir. Şartlar:
             //   • Rol avukat olacak,
             //   • Müşteri cari DETAYI açık olacak (selectedCustomerId dolu) — liste ekranı KAPALI kalır,
             //   • Müşterinin İCRA sürecinde en az bir odası olacak.
             // Böylece avukat yalnızca kendi takip ettiği icra dosyalarının carisini görür.
             if (isAvukat() && selectedCustomerId && isLegalActionCustomer(selectedCustomerId)
                 && (activeMenu === 'tum-musteriler' || activeMenu === 'mevcut-musteriler')) {
                 return null;
             }
             // activeMenu → ana menü mü yoksa alt sayfa mı, permId bul
             const topItem = menuItems.find(m => m.id === activeMenu);
             const subItem = menuItems.flatMap(m => m.subItems || []).find(s => s.id === activeMenu);
             let allowed = true;
             if (topItem && topItem.permId) allowed = hasPerm('mainMenus', topItem.permId);
             else if (subItem && subItem.permId) allowed = hasPerm('pages', subItem.permId);
             if (allowed) return null;
             return (
                <div className="max-w-md mx-auto mt-20 bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
                   <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><Lock size={28} className="text-red-400"/></div>
                   <h3 className="text-lg font-bold text-gray-800 mb-1">Erişim İzniniz Yok</h3>
                   <p className="text-sm text-gray-500">Bu sayfayı görüntüleme yetkiniz bulunmuyor. Yetki için lütfen yöneticinizle iletişime geçin.</p>
                </div>
             );
          })() || (
          <>
          {activeMenu === 'dashboard' ? (
             <div className="max-w-7xl mx-auto">
              {/* YENİ EKLENEN: Hoş geldin + günlük motivasyon bölümü */}
              <div className="mb-6 relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 p-6 sm:p-7 shadow-lg shadow-blue-500/20">
                 <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full"></div>
                 <div className="absolute -right-16 top-10 w-52 h-52 bg-white/5 rounded-full"></div>
                 <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                       <span className="text-white/80 text-xs font-bold uppercase tracking-widest">{getGreetingByHour()}</span>
                       <span className="text-white/50 text-xs">•</span>
                       <span className="text-white/70 text-xs font-medium">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">Hoş geldiniz, {currentUserProfile.name}! 👋</h2>
                    <p className="text-white/90 text-sm sm:text-base font-medium max-w-2xl leading-relaxed">“{getDailyMotivation()}”</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1 rounded-full">
                       <Shield size={13} className="text-white"/>
                       <span className="text-white text-[11px] font-bold">{getCurrentRole()?.name || currentUserProfile.role}</span>
                    </div>
                 </div>
              </div>
              {/* YENİ: Başlık + genel zaman filtresi — seçim tüm kartlardaki sayıları günceller */}
              <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                 <div><h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Özet</h1><h2 className="text-2xl font-bold text-gray-800">Gösterge Paneli</h2></div>
                 <div className="flex flex-wrap gap-1.5">
                    {[['today','Bugün'],['yesterday','Dün'],['week','Bu Hafta'],['month','Bu Ay'],['year','Bu Sene'],['all','Tüm Zamanlar']].map(([val,label]) => (
                       <button key={val} onClick={() => setDashboardRange(val)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm ${dashboardRange === val ? 'bg-indigo-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>{label}</button>
                    ))}
                 </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {/* DÜZELTİLDİ: Kartlar artık rol bazlı görünür (visibleDashboardCards) — Yönetici tümünü, diğer roller kendi setlerini görür */}
                {visibleDashboardCards.map((card) => {
                  // YENİ EKLENEN: İlk 5 kart tıklanınca detay penceresi açar
                  const detailMap = { 1: 'newCustomers', 2: 'exitedCustomers', 3: 'enteredRooms', 4: 'exitedRooms', 5: 'overdueMovements' };
                  const detailTitleMap = { 1: 'Bugün Kaydedilen Müşteriler', 2: 'Çıkış Yapan Müşteriler', 3: 'Giren Oda Sayısı', 4: 'Çıkan Oda Sayısı', 5: 'Odaya Giriş Çıkış İşlemi Yapan Müşteriler' };
                  const detailType = detailMap[card.id];
                  const clickable = !!detailType;
                  return (
                  <div key={card.id} onClick={clickable ? () => { setDashboardDetail({ type: detailType, title: detailTitleMap[card.id] }); setDashboardDetailFilter(dashboardRange); setDashboardDetailShowAll(false); } : undefined} className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative ${clickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}`}>
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${card.borderColor}`}></div>
                    <div className="p-5 pl-6">
                      <div className="flex justify-between items-start mb-4"><div className={`p-2 rounded-lg ${card.iconColor}`}><card.icon size={20} /></div><Sparkline data={card.chartData} color={card.chartColor} /></div>
                      <div><h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-1">{card.title}</h3><div className="text-3xl font-bold text-gray-800 mb-1">{card.value}</div><p className="text-xs text-gray-400 mb-4 h-4">{card.desc}</p></div>
                      {/* YENİ: Sembol Nakliyat kartı segmenti — Getiren / Çıkış Yapan / Toplam */}
                      {card.sembolSegment && (
                        <div className="flex gap-1 mb-3">
                          {[['getiren','Getiren'],['cikis','Çıkış Yapan'],['toplam','Toplam']].map(([val,lbl]) => (
                            <button key={val} onClick={(e) => { e.stopPropagation(); setSembolCardMode(val); }} className={`flex-1 px-1.5 py-1 rounded-md text-[10px] font-bold transition-colors ${sembolCardMode === val ? 'bg-[#1bc5bd] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{lbl}</button>
                          ))}
                        </div>
                      )}
                      <div><span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${card.tagColor}`}>{card.tag}</span></div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : activeMenu === 'randevu-olustur' ? (
             <div className="max-w-4xl mx-auto pb-10 animate-in fade-in duration-300">
                 <div className="mb-6">
                    <button onClick={() => setActiveMenu('takvim')} className="text-[10px] font-bold text-gray-400 hover:text-indigo-500 tracking-widest uppercase mb-1.5 flex items-center gap-1 transition-colors"><ArrowLeft size={12} /> Takvime Dön</button>
                    <h2 className="text-2xl font-bold text-slate-800">Randevu Oluştur</h2>
                    <p className="text-sm text-gray-500 mt-1">Mevcut veya yeni müşteriler için depo ziyareti / işlem randevusu planlayın.</p>
                 </div>
                 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
                    
                    <div className="mb-8">
                       <h4 className="text-sm font-bold text-gray-700 mb-4 border-b border-gray-100 pb-2">1. Müşteri Bilgileri</h4>
                       <div className="flex gap-6 mb-4">
                          <label className="flex items-center gap-2 cursor-pointer group">
                             <input type="radio" name="apptCustomerType" value="registered" checked={appointmentData.customerType === 'registered'} onChange={() => setAppointmentData({...appointmentData, customerType: 'registered'})} className="w-5 h-5 text-indigo-500 border-gray-300 focus:ring-indigo-500"/>
                             <span className={`text-sm font-bold transition-colors ${appointmentData.customerType === 'registered' ? 'text-slate-800' : 'text-gray-500'}`}>Mevcut Sistem Müşterisi</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                             <input type="radio" name="apptCustomerType" value="unregistered" checked={appointmentData.customerType === 'unregistered'} onChange={() => setAppointmentData({...appointmentData, customerType: 'unregistered'})} className="w-5 h-5 text-indigo-500 border-gray-300 focus:ring-indigo-500"/>
                             <span className={`text-sm font-bold transition-colors ${appointmentData.customerType === 'unregistered' ? 'text-slate-800' : 'text-gray-500'}`}>Kayıtsız / Yeni Müşteri</span>
                          </label>
                       </div>
                       
{appointmentData.customerType === 'registered' ? (
                           <div className="flex flex-col gap-1.5">
                               <label className="text-xs font-semibold text-gray-600">Müşteri Seçin (Zorunlu)</label>
                               
                               {/* ARAMA BARI BAŞLANGICI */}
                               <div className="relative">
                                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                       <Search size={16} className="text-gray-400" />
                                   </div>
                                   <input 
                                       type="text" 
                                       placeholder="Müşteri Adı veya No ile Ara..." 
                                       value={apptCustomerSearch} 
                                       onChange={(e) => setApptCustomerSearch(e.target.value)} 
                                       className="w-full pl-10 pr-4 py-2 mb-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white shadow-sm" 
                                   />
                               </div>
                               {/* ARAMA BARI BİTİŞİ */}

                               <select value={appointmentData.customerId} onChange={(e) => setAppointmentData({...appointmentData, customerId: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white">
                                   <option value="">Lütfen listeden müşteri seçin...</option>
                                   {customers.filter(c => {
                                       if (!apptCustomerSearch) return true;
                                       const searchLower = normalizeStr(apptCustomerSearch);
                                       const matchName = normalizeStr(c.name).includes(searchLower);
                                       const matchNo = c.customerNo && String(c.customerNo).includes(searchLower);
                                       return matchName || matchNo;
                                   }).map(c => (
                                       <option key={c.id} value={c.id}>{c.name} (No: {c.customerNo} - {c.phone})</option>
                                   ))}
                               </select>
                           </div>
                       ) : (
                        
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div className="flex flex-col gap-1.5">
                                   <label className="text-xs font-semibold text-gray-600">Ad Soyad (Zorunlu)</label>
                                   <input type="text" value={appointmentData.unregisteredName} onChange={(e) => setAppointmentData({...appointmentData, unregisteredName: e.target.value})} placeholder="Örn: AHMET YILMAZ" className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700" />
                               </div>
                               <div className="flex flex-col gap-1.5">
                                   <label className="text-xs font-semibold text-gray-600">Telefon (Zorunlu)</label>
                                   <input type="text" value={appointmentData.unregisteredPhone} onChange={(e) => setAppointmentData({...appointmentData, unregisteredPhone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700" />
                               </div>
                           </div>
                       )}
                    </div>

                    <div className="mb-8">
                       <h4 className="text-sm font-bold text-gray-700 mb-4 border-b border-gray-100 pb-2">2. Randevu Detayları</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                           <div className="flex flex-col gap-1.5">
                               <label className="text-xs font-semibold text-gray-600">Tarih (Zorunlu)</label>
                               <input type="date" value={appointmentData.date} onChange={(e) => setAppointmentData({...appointmentData, date: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700" />
                           </div>
                           <div className="flex flex-col gap-1.5">
                               <label className="text-xs font-semibold text-gray-600">Saat Aralığı (Zorunlu)</label>
                               <select value={appointmentData.time} onChange={(e) => setAppointmentData({...appointmentData, time: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white">
                                   <option value="09:00 - 10:00">09:00 - 10:00</option>
                                   <option value="10:00 - 11:00">10:00 - 11:00</option>
                                   <option value="11:00 - 12:00">11:00 - 12:00</option>
                                   <option value="12:00 - 13:00">12:00 - 13:00</option>
                                   <option value="13:00 - 14:00">13:00 - 14:00</option>
                                   <option value="14:00 - 15:00">14:00 - 15:00</option>
                                   <option value="15:00 - 16:00">15:00 - 16:00</option>
                                   <option value="16:00 - 17:00">16:00 - 17:00</option>
                                   <option value="17:00 - 18:00">17:00 - 18:00</option>
                               </select>
                           </div>
                           <div className="flex flex-col gap-1.5 md:col-span-2">
                               <label className="text-xs font-semibold text-gray-600">Depo Şubesi (Zorunlu)</label>
                               <select value={appointmentData.warehouseId} onChange={(e) => setAppointmentData({...appointmentData, warehouseId: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white">
                                   <option value="">Lütfen Şube Seçin...</option>
                                   {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                               </select>
                           </div>
                       </div>
                       
                       <div className="flex flex-col gap-1.5">
                           <label className="text-xs font-semibold text-gray-600 mb-2">Depoya Gelme Amacı (Zorunlu)</label>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                               {Object.entries(appointmentPurposes).map(([key, data]) => (
                                   <label key={key} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${appointmentData.purpose === key ? `border-indigo-400 bg-indigo-50/30` : 'border-gray-200 bg-white hover:border-indigo-200'}`}>
                                       <input type="radio" name="apptPurpose" value={key} checked={appointmentData.purpose === key} onChange={() => setAppointmentData({...appointmentData, purpose: key})} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500"/>
                                       <div className="flex items-center gap-2">
                                          <div className={`w-3 h-3 rounded-full ${data.color}`}></div>
                                          <span className={`font-bold text-sm ${appointmentData.purpose === key ? 'text-indigo-800' : 'text-gray-600'}`}>{data.label}</span>
                                       </div>
                                   </label>
                               ))}
                           </div>
                       </div>
                    </div>
                    
                    <div className="mt-8 flex flex-col sm:flex-row justify-end gap-3 border-t border-gray-100 pt-6">
                       {(() => {
                          const isDisabled = (appointmentData.customerType === 'registered' && !appointmentData.customerId) ||
                              (appointmentData.customerType === 'unregistered' && (!appointmentData.unregisteredName || !appointmentData.unregisteredPhone)) ||
                              !appointmentData.warehouseId || !appointmentData.date;
                          return (
                            <>
                              <button onClick={() => handleSaveAppointment(false)} disabled={isDisabled} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30">
                                 <Check strokeWidth={3} size={20} /> Sadece Randevuyu Kaydet
                              </button>
                              <button onClick={() => handleSaveAppointment(true)} disabled={isDisabled} className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-500/30">
                                 <MessageCircle size={18} /> Kaydet + WhatsApp'tan Bilgilendir
                              </button>
                            </>
                          );
                       })()}
                    </div>

                 </div>
             </div>
          ) : activeMenu === 'randevu-takvimi' || activeMenu === 'takvim' ? (
             <div className="max-w-5xl mx-auto pb-10 animate-in fade-in duration-300">
                 <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="shrink-0">
                        <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Takvim</h1>
                        <h2 className="text-2xl font-bold text-slate-800">Randevu Takvimi</h2>
                    </div>

                    <button onClick={() => setActiveMenu('randevu-olustur')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md shadow-indigo-500/20 flex items-center gap-2 shrink-0 transition-colors">
                        <Plus size={16} /> Yeni Randevu Ekle
                    </button>
                 </div>

                 <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-6 sm:p-8 mb-8">
                     <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
                         <div className="flex items-center gap-4 bg-gray-50/50 p-2 rounded-2xl border border-gray-100 shadow-sm">
                             <button onClick={() => {
                                 if(calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
                                 else { setCalendarMonth(calendarMonth - 1); }
                             }} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-gray-600 hover:bg-gray-50 transition-colors"><ArrowLeft size={18} /></button>
                             <h3 className="text-lg sm:text-xl font-bold text-gray-800 w-32 sm:w-40 text-center tracking-wide">
                                 {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][calendarMonth]} {calendarYear}
                             </h3>
                             <button onClick={() => {
                                 if(calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1); }
                                 else { setCalendarMonth(calendarMonth + 1); }
                             }} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-gray-600 hover:bg-gray-50 transition-colors"><ArrowLeft size={18} className="rotate-180" /></button>
                         </div>
                         
                         <div className="flex flex-col items-end gap-3 text-[10px] sm:text-xs font-bold">
                             <div className="flex flex-wrap justify-end items-center gap-x-4 gap-y-2">
                                 {/* GÜNCELLENDİ: Tüm randevu türleri kendi renkleriyle gösterilir (Odadan Tüm Eşya + Depo Temizlik dahil) */}
                                 {Object.entries(appointmentPurposes).map(([key, data]) => {
                                     // Kısa, anlaşılır etiketler
                                     const shortLabels = { 'giris-cikis': 'Odadan', 'ziyaret': 'Ziyaret', 'esya-getirme': 'Eşya Getirme', 'tahliye': 'Tüm Eşya Çıkış', 'temizlik': 'Temizlik' };
                                     return (
                                        <div key={key} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${data.color}`}></div><span className="text-gray-600">{shortLabels[key] || data.label.split(' ')[0]}</span></div>
                                     );
                                 })}
                             </div>
                             <div className="flex flex-wrap justify-end items-center gap-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                                 <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full border border-gray-300 bg-white"></div><span className="text-gray-500">Boş (0)</span></div>
                                 <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full border border-gray-200 bg-gray-50"></div><span className="text-gray-600">Müsait (1-3)</span></div>
                                 <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-50 border border-red-200"></div><span className="text-gray-800">Yoğun (4)</span></div>
                                 <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-black"></div><span className="text-black">Dolu (5+)</span></div>
                             </div>
                         </div>
                     </div>
                     
                     <div className="grid grid-cols-7 gap-2 sm:gap-3 lg:gap-4">
                         {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                             <div key={d} className="text-center text-xs font-bold text-gray-400 pb-2">{d}</div>
                         ))}
                         
                         {(() => {
                             const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
                             const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
                             const cells = [];
                             
                             for(let i=0; i<firstDay; i++) {
                                 cells.push(<div key={`empty-${i}`} className="min-h-[70px] sm:min-h-[90px] rounded-2xl bg-transparent"></div>);
                             }
                             
                             for(let i=1; i<=daysInMonth; i++) {
                                 const currentDateStr = `${calendarYear}-${(calendarMonth+1).toString().padStart(2,'0')}-${i.toString().padStart(2,'0')}`;
                                 const isSelected = selectedCalendarDate === currentDateStr;
                                 const dayAppts = appointments.filter(a => a.date === currentDateStr);
                                 const count = dayAppts.length;
                                 
                                 let cellBg = 'bg-white border-gray-200 text-gray-800';
                                 let countText = 'text-gray-400';
                                 let dayText = 'text-gray-800';

                                 if (count === 0) {
                                     cellBg = 'bg-white border-gray-200 hover:border-gray-300';
                                 } else if (count >= 1 && count <= 3) {
                                     cellBg = 'bg-gray-50 border-gray-100 hover:bg-gray-200';
                                 } else if (count === 4) {
                                     cellBg = 'bg-[#fff4f4] border-red-100 hover:bg-red-50';
                                     countText = 'text-red-400';
                                     dayText = 'text-red-900';
                                 } else if (count >= 5) {
                                     cellBg = 'bg-black border-black hover:bg-gray-900';
                                     dayText = 'text-white';
                                     countText = 'text-gray-400';
                                 }

                                 if (isSelected) {
                                     cellBg += ' ring-2 ring-red-500 ring-offset-2 border-transparent';
                                 }
                                 
                                 cells.push(
                                     <div key={i} onClick={() => setSelectedCalendarDate(currentDateStr)} className={`min-h-[70px] sm:min-h-[90px] p-2 sm:p-3 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all shadow-sm ${cellBg}`}>
                                         <div className="flex justify-between items-start">
                                             <span className={`text-sm sm:text-base font-bold ${dayText}`}>{i}</span>
                                             {count > 0 && <span className={`text-[9px] sm:text-[10px] font-bold ${countText}`}>{count} İş</span>}
                                         </div>
                                         <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-2 content-start">
                                             {dayAppts.map(a => (
                                                 <div key={a.id} className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${appointmentPurposes[a.purpose].color} shadow-sm`} title={appointmentPurposes[a.purpose].label}></div>
                                             ))}
                                         </div>
                                     </div>
                                 );
                             }
                             return cells;
                         })()}
                     </div>
                 </div>

                 {/* Seçili Günün Detayları */}
                 <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                     <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
                         <Calendar size={20} className="text-indigo-600" />
                         {(() => {
                             const d = new Date(selectedCalendarDate);
                             return `${d.getDate()} ${['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][d.getMonth()]} ${d.getFullYear()} - Randevu Listesi`;
                         })()}
                     </h3>

                     {(() => {
                         const dayAppts = appointments.filter(a => a.date === selectedCalendarDate).sort((a,b) => a.time.localeCompare(b.time));
                         
                         if(dayAppts.length === 0) {
                             return (
                                 <div className="text-center py-10">
                                     <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3"><Clock size={24} className="text-gray-300" /></div>
                                     <p className="text-sm font-medium text-gray-500">Bu güne ait herhangi bir randevu kaydı bulunmamaktadır.</p>
                                 </div>
                             );
                         }

                         return (
                             <div className="flex flex-col gap-4">
                                 {dayAppts.map(appt => {
                                     const pData = appointmentPurposes[appt.purpose];
                                     const warehouseName = warehouses.find(w => w.id === appt.warehouseId)?.name;
                                     // YENİ EKLENEN: Randevuyu oluşturan kişi mi yoksa Yönetici mi kontrolü
                                     const isOwnAppointment = appt.createdBy && appt.createdBy === currentUserProfile.name;
                                     const isManagerUser = currentUserProfile.role === 'Yönetici';
                                     // YENİ: Arama & WhatsApp butonları için numarayı normalize et.
                                     // Rakam dışını temizle, baştaki 0'ı at, ülke kodu (90) yoksa ekle → uluslararası format.
                                     let _apptDigits = String(appt.customerPhone || '').replace(/\D/g, '');
                                     if (_apptDigits.startsWith('0')) _apptDigits = _apptDigits.slice(1);
                                     if (_apptDigits && !_apptDigits.startsWith('90')) _apptDigits = '90' + _apptDigits;
                                     const apptTelHref = `tel:+${_apptDigits}`;      // arama linki
                                     const apptWaHref = `https://wa.me/${_apptDigits}`; // WhatsApp linki
                                     return (
                                         <div key={appt.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${pData.border} ${pData.bgLight} transition-shadow hover:shadow-md`}>
                                             <div className="flex items-start gap-4 mb-3 sm:mb-0">
                                                 <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white ${pData.color} shadow-sm`}>
                                                     <Clock size={20} />
                                                 </div>
                                                 <div>
                                                     <div className="flex flex-wrap items-center gap-2 mb-1">
                                                         <h4 className="font-bold text-gray-800 text-[15px]">{appt.customerName}</h4>
                                                         {appt.customerType === 'unregistered' && <span className="bg-gray-200 text-gray-600 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Kayıtsız Müşteri</span>}
                                                     </div>
                                                     <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-gray-600">
                                                         <span className="flex items-center gap-1.5 text-gray-500">
                                                             {/* YENİ: Telefon simgesi artık ARAMA butonu — tıklanınca müşteriyi arar */}
                                                             {appt.customerPhone ? (
                                                                 <a href={apptTelHref} onClick={(e)=>e.stopPropagation()} className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-500 hover:bg-blue-600 text-white transition-colors shadow-sm" title="Ara"><Phone size={12}/></a>
                                                             ) : (<Phone size={12}/>)}
                                                             {appt.customerPhone}
                                                             {/* YENİ: WhatsApp butonu — tıklanınca WhatsApp sohbeti açılır */}
                                                             {appt.customerPhone && (
                                                                 <a href={apptWaHref} target="_blank" rel="noreferrer" onClick={(e)=>e.stopPropagation()} className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors shadow-sm" title="WhatsApp'tan Yaz"><MessageCircle size={12}/></a>
                                                             )}
                                                         </span>
                                                         <span className="flex items-center gap-1 text-gray-500"><Home size={12}/> {warehouseName}</span>
                                                         {/* GÜNCELLENDİ: Randevuyu AÇAN kişi artık belirgin bir etiketle gösterilir.
                                                             Eski kayıtlarda bu alan boş olabileceği için "Bilinmiyor" yazılır. */}
                                                         <span className="flex items-center gap-1.5 bg-white/70 border border-gray-200 px-2 py-0.5 rounded-md text-[11px] font-bold text-gray-600 shadow-sm" title={appt.createdAt ? `Oluşturma: ${new Date(appt.createdAt).toLocaleString('tr-TR')}` : 'Oluşturma zamanı kayıtlı değil'}>
                                                             <UserCog size={12} className="text-indigo-500"/>
                                                             Açan: {appt.createdBy || 'Bilinmiyor'}
                                                             {appt.createdByRole && <span className="text-gray-400 font-medium">({appt.createdByRole})</span>}
                                                         </span>
                                                     </div>
                                                 </div>
                                             </div>
<div className="flex flex-col items-start sm:items-end gap-2 sm:pl-4 sm:border-l border-white/50">
                                                 <span className={`text-xs font-bold px-2 py-1 rounded bg-white shadow-sm ${pData.text}`}>{pData.label}</span>
                                                 <div className="flex items-center gap-2">
                                                     <span className="font-black text-gray-800 bg-white/50 px-2 py-0.5 rounded text-sm">{appt.time}</span>
                                                     <button onClick={() => { setEditApptData({...appt}); setIsEditApptModalOpen(true); }} className="bg-white hover:bg-indigo-50 text-indigo-600 p-1.5 rounded-lg transition-colors shadow-sm border border-indigo-100" title="Randevuyu Düzenle"><Edit size={14}/></button>
                                                     {/* YENİ EKLENEN: İptal Et butonu — randevuyu oluşturan kişi veya Yönetici görebilir */}
                                                     {(isOwnAppointment || isManagerUser) && (
                                                         <button onClick={() => { if(window.confirm('Bu randevuyu iptal etmek istediğinize emin misiniz?')) handleDeleteAppointment(appt.id); }} className="bg-white hover:bg-orange-50 text-orange-600 p-1.5 rounded-lg transition-colors shadow-sm border border-orange-100" title="Randevuyu İptal Et"><X size={14}/></button>
                                                     )}
                                                     {/* Sil butonu artık sadece Yönetici rütbesindeki kullanıcılara görünür */}
                                                     {isManagerUser && (
                                                         <button onClick={() => { if(window.confirm('Bu randevuyu silmek istediğinize emin misiniz?')) handleDeleteAppointment(appt.id); }} className="bg-white hover:bg-red-50 text-red-600 p-1.5 rounded-lg transition-colors shadow-sm border border-red-100" title="Randevuyu Sil (Yönetici)"><Trash2 size={14}/></button>
                                                     )}
                                                 </div>
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                         );
                     })()}
                 </div>

             </div>
          ) : (activeMenu === 'musteri-ekle' || activeMenu === 'mevcut-musteriler' || activeMenu === 'tum-musteriler' || selectedCustomerId) ? (
            <Musteri
              activeMenu={activeMenu} setActiveMenu={setActiveMenu}
              selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId}
              customers={customers} setCustomers={setCustomers}
              rooms={rooms} setRooms={setRooms}
              blocks={blocks}
              setSelectedWarehouseId={setSelectedWarehouseId} setSelectedBlockId={setSelectedBlockId} setSelectedRoomId={setSelectedRoomId}
              db={db} firebaseUser={firebaseUser} appId={appId}
              checkActionPerm={checkActionPerm} logActivity={logActivity} archiveDeletedItem={archiveDeletedItem} uploadImageToServer={uploadImageToServer}
              currentUserProfile={currentUserProfile}
              pendingCollections={pendingCollections} setPendingCollections={setPendingCollections}
              sembolePaymentAktar={sembolePaymentAktar} sembolePaymentSil={sembolePaymentSil}
              hasActivePaymentOnDate={hasActivePaymentOnDate} hasActiveSameAmountOnDate={hasActiveSameAmountOnDate}
              getCustomerLedger={getCustomerLedger}
              handleOpenMessageModal={handleOpenMessageModal}
              setReminderModal={setReminderModal}
              collectionRates={collectionRates}
              contractSettings={contractSettings}
              getRoomLatestFee={getRoomLatestFee} getRoomLatestGrossFee={getRoomLatestGrossFee}
              parseDateLocal={parseDateLocal}
              displayRoomM3={displayRoomM3}
              isAvukat={isAvukat}
              inDashboardRange={inDashboardRange} parseAnyDate={parseAnyDate}
              handleNavClick={handleNavClick}
              renderNewCustomerForm={renderNewCustomerForm}
            />
          ) : (activeMenu === 'odeme-girisi' || activeMenu === 'aylik-odeme' || activeMenu === 'tahsilat-hareketleri' || activeMenu === 'askida-kalan-odemeler' || activeMenu === 'tahsilat-oranlari') ? (
            <Odeme
              activeMenu={activeMenu} setActiveMenu={setActiveMenu}
              customers={customers} setCustomers={setCustomers}
              rooms={rooms}
              pendingCollections={pendingCollections} setPendingCollections={setPendingCollections}
              db={db} firebaseUser={firebaseUser} appId={appId}
              checkActionPerm={checkActionPerm} logActivity={logActivity} uploadImageToServer={uploadImageToServer}
              currentUserProfile={currentUserProfile}
              sembolePaymentAktar={sembolePaymentAktar} sembolePaymentSil={sembolePaymentSil}
              hasActivePaymentOnDate={hasActivePaymentOnDate}
              getCustomerLedger={getCustomerLedger}
              handleOpenMessageModal={handleOpenMessageModal}
              reminders={reminders} setReminders={setReminders}
              collectionRates={collectionRates} setCollectionRates={setCollectionRates}
              setSelectedCustomerId={setSelectedCustomerId}
            />
          ) : activeMenu === 'hatirlatmalar' ? (
            <div className="w-full max-w-none mx-auto flex flex-col pb-10 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                <div>
                  <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Hatırlatma Takvimi</h1>
                  <h2 className="text-2xl font-bold text-slate-800">Hatırlatmalar</h2>
                  <p className="text-sm text-gray-500 mt-1">Ödeme sözleri, günlük notlar ve görevleri takvim üzerinde takip edin; tamamlandı olarak işaretleyin.</p>
                </div>
                <button onClick={() => setReminderModal({ mode: 'add', data: { date: reminderSelectedDate, time: '', title: 'Şirket', note: '', type: 'promise', customerName: '', completed: false, files: [] } })} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 shrink-0"><Plus size={16}/> Yeni Hatırlatma</button>
              </div>
              {(() => {
                  const today = new Date().toISOString().split('T')[0];
                  const pending = reminders.filter(r => !r.completed && r.date && r.date <= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
                  const selD = new Date(reminderSelectedDate + 'T00:00:00');
                  const year = selD.getFullYear(); const month = selD.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const startOffset = (firstDay.getDay() + 6) % 7;
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
                  const pad = (n) => String(n).padStart(2, '0');
                  const cells = [];
                  for (let i = 0; i < startOffset; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);
                  const shiftMonth = (delta) => { const nd = new Date(year, month + delta, 1); setReminderSelectedDate(`${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-01`); };
                  const dayReminders = reminders.filter(r => r.date === reminderSelectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                  const typeMeta = { promise: { label: 'Ödeme Sözü', cls: 'bg-orange-100 text-orange-700 border-orange-200' }, note: { label: 'Günlük Not', cls: 'bg-blue-100 text-blue-700 border-blue-200' }, task: { label: 'Görev', cls: 'bg-red-100 text-red-700 border-red-200' } };
                  return (
                    <div className="flex flex-col gap-6">
                      {pending.length > 0 && (
                        <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4">
                           <div className="flex items-center gap-2 mb-2"><AlertCircle size={18} className="text-red-500"/><h3 className="font-bold text-red-700">Bekleyen Hatırlatmalar ({pending.length})</h3></div>
                           <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                              {pending.slice(0, 30).map(r => (
                                 <div key={r.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-red-100">
                                    <div className="min-w-0">
                                       <span className="text-xs font-bold text-slate-700">{r.title}</span>
                                       {/* YENİ EKLENEN: Bekleyen listede de müşteri adı tıklanınca carisine gider. */}
                                       {r.customerName ? <span onClick={() => { const _rc = customers.find(c => c.name === r.customerName); if (_rc) setSelectedCustomerId(_rc.id); }} className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"> • {r.customerName}</span> : null}
                                       <span className="text-[11px] text-red-500 font-bold"> • {new Date(r.date).toLocaleDateString('tr-TR')}{r.time ? ' ' + r.time : ''}</span>
                                    </div>
                                    <button onClick={() => handleToggleReminder(r)} className="shrink-0 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1"><Check size={11}/> Tamamlandı</button>
                                 </div>
                              ))}
                           </div>
                        </div>
                      )}
                      {/* GÜNCELLENDİ: Takvim TAM GENİŞLİK (üstte), seçili günün detayları ALTINDA — tek sütun düzen. */}
                      <div className="grid grid-cols-1 gap-6">
                         <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 w-full">
                            <div className="flex items-center justify-between mb-3">
                               <button onClick={() => shiftMonth(-1)} className="w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 font-bold text-lg flex items-center justify-center">‹</button>
                               <h3 className="font-bold text-slate-800">{monthNames[month]} {year}</h3>
                               <button onClick={() => shiftMonth(1)} className="w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 font-bold text-lg flex items-center justify-center">›</button>
                            </div>
                            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 lg:gap-3 text-center text-[10px] font-bold text-gray-400 mb-1">
                               {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d => <div key={d}>{d}</div>)}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 lg:gap-3">
                               {cells.map((ds, i) => {
                                  if (!ds) return <div key={'e' + i} />;
                                  const dayN = Number(ds.slice(-2));
                                  const dr = reminders.filter(r => r.date === ds);
                                  const isSel = ds === reminderSelectedDate;
                                  const isToday = ds === today;
                                  return (
                                    <div key={ds} onClick={() => setReminderSelectedDate(ds)} className={`min-h-[56px] sm:min-h-[72px] p-1.5 sm:p-2.5 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all shadow-sm ${isSel ? 'ring-2 ring-indigo-500 ring-offset-1 border-transparent bg-indigo-600 text-white' : isToday ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white border-gray-200 hover:border-gray-300 text-slate-700'}`}>
                                       <div className="flex justify-between items-start">
                                          <span className="text-xs sm:text-sm font-bold">{dayN}</span>
                                          {dr.length > 0 && <span className={`text-[8px] sm:text-[9px] font-bold ${isSel ? 'text-white/80' : 'text-gray-400'}`}>{dr.length}</span>}
                                       </div>
                                       {/* YENİ: Simgeler 3'erli satırlar halinde, en fazla 9 (3x3) gösterilir.
                                           RENK: tamamlandıysa TÜR fark etmeksizin YEŞİL; tamamlanmadıysa türe göre
                                           (Ödeme Sözü=turuncu, Günlük Not=mavi, Görev=kırmızı).
                                           SİMGE: tamamlandı=✓ onay, tamamlanmadı=✗ çarpı.
                                           Tüm gün kutuları 9 simgeye yetecek sabit boyuttadır. */}
                                       {/* GÜNCELLENDİ: Kutular Randevular takvimiyle aynı boyuta indirildiği için
                                           simgeler 3x3 sabit grid yerine Randevulardaki gibi flex-wrap ile dizilir. */}
                                       <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-1 content-start">
                                          {dr.slice(0, 9).map((r, di) => {
                                             const tc = r.completed
                                                 ? 'bg-green-500'
                                                 : (r.type === 'promise' ? 'bg-orange-500' : r.type === 'note' ? 'bg-blue-500' : 'bg-red-500');
                                             const tl = r.type === 'promise' ? 'Ödeme Sözü' : r.type === 'note' ? 'Günlük Not' : 'Görev';
                                             return (
                                                <span key={r.id || di} title={`${tl} — ${r.completed ? 'Tamamlandı' : 'Tamamlanmadı'}${r.customerName ? ' • ' + r.customerName : ''}`} className={`inline-flex items-center justify-center w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full text-white shadow-sm ${tc}`}>
                                                   {r.completed ? <Check size={7} strokeWidth={4}/> : <X size={7} strokeWidth={4}/>}
                                                </span>
                                             );
                                          })}
                                          {dr.length > 9 && <span className={`text-[8px] font-bold leading-none self-center ${isSel ? 'text-white/80' : 'text-gray-400'}`}>+{dr.length - 9}</span>}
                                       </div>
                                    </div>
                                  );
                               })}
                            </div>
                            <div className="mt-3 flex flex-col gap-2 text-[10px] text-gray-500 font-bold">
                               <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="text-gray-400 uppercase tracking-wide">Tür:</span>
                                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> Ödeme Sözü</span>
                                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Günlük Not</span>
                                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Görev</span>
                               </div>
                               <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="text-gray-400 uppercase tracking-wide">Durum:</span>
                                  <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500 text-white"><Check size={9} strokeWidth={3.5}/></span> Tamamlandı (tür fark etmez yeşil)</span>
                                  <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-400 text-white"><X size={9} strokeWidth={3.5}/></span> Tamamlanmadı</span>
                               </div>
                            </div>
                         </div>
                         <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="flex items-center justify-between mb-3">
                               <h3 className="font-bold text-slate-800">{new Date(reminderSelectedDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                               <button onClick={() => setReminderModal({ mode: 'add', data: { date: reminderSelectedDate, time: '', title: 'Şirket', note: '', type: 'promise', customerName: '', completed: false, files: [] } })} className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2 py-1 text-[11px] font-bold flex items-center gap-1 border border-indigo-100"><Plus size={12}/> Ekle</button>
                            </div>
                            {dayReminders.length === 0 ? (
                               <div className="text-center py-10 text-gray-400 text-sm">Bu güne ait hatırlatma yok.</div>
                            ) : (
                               <div className="flex flex-col gap-2 max-h-[440px] overflow-y-auto pr-1">
                                  {dayReminders.map(r => {
                                     const tm = typeMeta[r.type] || typeMeta.note;
                                     return (
                                       <div key={r.id} className={`rounded-xl border p-3 ${r.completed ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-white border-gray-200'}`}>
                                          <div className="flex items-start gap-2">
                                             <button onClick={() => handleToggleReminder(r)} title={r.completed ? 'Tamamlanmadı yap' : 'Tamamlandı yap'} className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${r.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{r.completed && <Check size={13} strokeWidth={3}/>}</button>
                                             <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                   <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tm.cls}`}>{tm.label}</span>
                                                   {r.time ? <span className="text-[10px] font-bold text-gray-500 flex items-center gap-0.5"><Clock size={10}/> {r.time}</span> : null}
                                                </div>
                                                <div className={`text-sm font-bold text-slate-800 mt-1 ${r.completed ? 'line-through' : ''}`}>{r.title}</div>
                                                {/* YENİ EKLENEN: Müşteri adı tıklanınca cari ekranına gider; yanında Ara ve WhatsApp kısayolları. */}
                                                {r.customerName ? (() => {
                                                    const _rc = customers.find(c => c.name === r.customerName);
                                                    const _ph = String(_rc?.phone || '').replace(/\D/g, '');
                                                    const _wa = _ph ? (_ph.startsWith('90') ? _ph : (_ph.startsWith('0') ? '9' + _ph : '90' + _ph)) : '';
                                                    return (
                                                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                            <button onClick={() => { if (_rc) setSelectedCustomerId(_rc.id); }} className={`text-[11px] font-bold ${_rc ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-gray-500 cursor-default'}`} title={_rc ? 'Müşterinin carisine git' : ''}>Müşteri: {r.customerName}</button>
                                                            {_rc?.phone ? (<>
                                                                <a href={`tel:${_rc.phone}`} className="bg-green-500 hover:bg-green-600 text-white rounded-md p-1 shadow-sm" title={`Ara: ${_rc.phone}`}><Phone size={11}/></a>
                                                                <a href={`https://wa.me/${_wa}`} target="_blank" rel="noreferrer" className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-md p-1 shadow-sm" title="WhatsApp ile yaz"><MessageCircle size={11}/></a>
                                                            </>) : null}
                                                        </div>
                                                    );
                                                })() : null}
                                                {r.note ? <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{r.note}</div> : null}

                                                {/* ═══════════════════════════════════════════════════
                                                    YENİ EKLENEN: ÖDEME SÖZÜ GÜNCELLEME NOTLARI
                                                    Her güncelleme, notu ve TARİHİ ile birlikte listelenir.
                                                    Böylece sözün nasıl geliştiği (kim, ne zaman, ne dedi) görünür.
                                                    ═══════════════════════════════════════════════════ */}
                                                {Array.isArray(r.promiseUpdates) && r.promiseUpdates.length > 0 && (
                                                   <div className="flex flex-col gap-1 mt-2">
                                                      {r.promiseUpdates.slice().sort((a,b) => (a.at||0)-(b.at||0)).map(u => (
                                                         <div key={u.id} className="bg-orange-50/70 border-l-[3px] border-orange-400 rounded-r-md px-2 py-1">
                                                            <div className="text-[11px] text-slate-700 font-medium whitespace-pre-wrap">{u.text}</div>
                                                            <div className="text-[9px] text-gray-400 font-bold mt-0.5">
                                                               {u.at ? new Date(u.at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}
                                                               {u.by ? ` · ${u.by}` : ''}
                                                               {u.movedFrom ? ` · ${u.movedFrom} → bugüne taşındı` : ''}
                                                            </div>
                                                         </div>
                                                      ))}
                                                   </div>
                                                )}
                                                {Array.isArray(r.files) && r.files.length > 0 && (
                                                   <div className="flex flex-wrap gap-1 mt-1.5">
                                                      {r.files.map((f, i) => (
                                                         <a key={f.id || i} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 hover:underline max-w-[130px] truncate"><FileTextIcon size={10}/> {f.name || 'Belge'}</a>
                                                      ))}
                                                   </div>
                                                )}
                                             </div>
                                             <div className="flex flex-col gap-1 shrink-0">
                                                {/* YENİ: GÜNCELLE — yalnızca ödeme sözü kartlarında görünür.
                                                    Not girilir, kayıt BUGÜNE taşınır ve not tarihiyle birlikte saklanır. */}
                                                {r.type === 'promise' && (
                                                   <button onClick={() => { setPromiseUpdateTarget(r); setPromiseUpdateText(''); setPromiseUpdateDate(new Date().toISOString().split('T')[0]); setIsPromiseUpdateOpen(true); }} className="text-orange-600 hover:text-orange-700 bg-orange-50 rounded p-1 border border-orange-200" title="Güncelle: not ekle ve bugüne taşı"><RefreshCcw size={12}/></button>
                                                )}
                                                <button onClick={() => setReminderModal({ mode: 'edit', data: { ...r } })} className="text-blue-500 hover:text-blue-700 bg-blue-50 rounded p-1 border border-blue-100"><Edit size={12}/></button>
                                                <button onClick={() => handleDeleteReminder(r.id)} className="text-red-500 hover:text-red-700 bg-red-50 rounded p-1 border border-red-100"><Trash2 size={12}/></button>
                                             </div>
                                          </div>
                                       </div>
                                     );
                                  })}
                               </div>
                            )}
                         </div>
                      </div>
                    </div>
                  );
              })()}
            </div>
          ) : activeMenu === 'icra-odalari' ? (
            /* YENİ: İCRA ODALARI — icra (yasal takip) sürecindeki odaların detaylı listesi */
            <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6">
                  <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Finans / Yasal Takip</h1>
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Shield size={24} className="text-red-500" /> İcra Odaları</h2>
                  <p className="text-sm text-gray-500 mt-1">İcra (yasal takip) sürecinde olan odaların detaylı listesi. Bu odalarda kira borçlandırması devam eder; cari borç bu sayfadan takip edilir.</p>
              </div>

              {(() => {
                  // İcra sürecindeki odalar, en yeni icra başlangıcı en üstte
                  const legalRooms = rooms
                      .filter(r => r.isUnderLegalAction)
                      .sort((a, b) => (b.legalActionStartDate || 0) - (a.legalActionStartDate || 0));

                  if (legalRooms.length === 0) {
                      return (
                          <div className="py-20 text-center bg-white rounded-xl border border-dashed border-gray-300 shadow-sm">
                              <Shield size={44} className="mx-auto text-gray-300 mb-4" />
                              <h3 className="text-lg font-bold text-gray-700">İcra Sürecinde Oda Yok</h3>
                              <p className="text-sm text-gray-500 mt-1">Şu anda yasal takip (icra) sürecinde olan bir oda bulunmuyor.</p>
                          </div>
                      );
                  }

                  return (
                      <div className="flex flex-col gap-4 pb-8">
                          {/* Üst özet şeridi */}
                          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0"><Shield size={20} /></div>
                              <div>
                                  <span className="text-2xl font-black text-red-600 leading-none">{legalRooms.length}</span>
                                  <span className="text-sm font-bold text-red-500 ml-2">oda icra sürecinde</span>
                              </div>
                          </div>

                          {legalRooms.map(room => {
                              const block = blocks.find(b => b.id === room.blockId);
                              const warehouse = warehouses.find(w => w.id === block?.warehouseId);
                              const cust = customers.find(c => c.name === room.customerName);
                              const startDate = room.legalActionStartDate ? new Date(room.legalActionStartDate) : null;
                              const startStr = startDate ? `${String(startDate.getDate()).padStart(2, '0')}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${startDate.getFullYear()}` : '-';
                              const daysInLegal = startDate ? Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86400000)) : null;
                              // Odanın en son geçerli kirası (KDV dahil gösterim)
                              const baseFee = getRoomLatestFee(room);
                              const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
                              const feeTotal = hasKdv ? Math.round(baseFee * 1.20) : baseFee;
                              // YENİ: Müşterinin TOPLAM CARİ BORCU — borç takibi artık bu sayfadan yapılır
                              let custDebt = 0;
                              if (cust) { try { const { balance } = getCustomerLedger(cust); custDebt = Math.max(0, Math.round(balance)); } catch (e) { custDebt = 0; } }

                              return (
                                  <div key={room.id} className="bg-white rounded-xl shadow-sm border-l-4 border-red-500 border border-gray-100 p-5">
                                      {/* Üst satır: Oda + konum + icra rozeti */}
                                      <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                                          <div>
                                              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Box size={18} className="text-red-500" /> {room.name}</h3>
                                              <p className="text-xs text-gray-500 font-medium mt-0.5">{warehouse?.name} — {block?.name} • {displayRoomM3(room)} m³</p>
                                          </div>
                                          <span className="bg-red-100 text-red-600 text-[10px] font-black px-2.5 py-1.5 rounded-full uppercase tracking-wide animate-pulse">İcra Sürecinde</span>
                                      </div>

                                      {/* Detay bilgiler */}
                                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Müşteri</p>
                                              <p className="text-sm font-bold text-slate-700 truncate" title={room.customerName}>{room.customerName || '-'}</p>
                                              {cust?.customerNo && <p className="text-[10px] text-gray-400 mt-0.5">No: {cust.customerNo}</p>}
                                          </div>
                                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">İcra Başlangıcı</p>
                                              <p className="text-sm font-bold text-slate-700">{startStr}</p>
                                              {daysInLegal !== null && <p className="text-[10px] text-red-500 font-bold mt-0.5">{daysInLegal} gündür icrada</p>}
                                          </div>
                                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Aylık Kira</p>
                                              <p className="text-sm font-bold text-slate-700">{feeTotal.toLocaleString('tr-TR')} TL</p>
                                              <p className="text-[10px] text-gray-400 mt-0.5">{hasKdv ? 'KDV Dahil' : 'KDV Yok'}</p>
                                          </div>
                                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Giriş Tarihi</p>
                                              <p className="text-sm font-bold text-slate-700">{room.entryDate || '-'}</p>
                                          </div>
                                          {/* YENİ: Toplam cari borç kutusu — borçlandırma devam eder, takip buradan yapılır */}
                                          <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                                              <p className="text-[10px] font-bold text-red-400 uppercase mb-1">Toplam Cari Borç</p>
                                              <p className="text-sm font-black text-red-600">{custDebt.toLocaleString('tr-TR')} TL</p>
                                              <p className="text-[10px] text-red-400 mt-0.5">Borçlanma devam ediyor</p>
                                          </div>
                                      </div>

                                      {/* İcra sebebi */}
                                      {room.legalActionReason && (
                                          <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4">
                                              <p className="text-[10px] font-bold text-red-400 uppercase mb-1">İcra Sebebi</p>
                                              <p className="text-sm text-red-700 font-medium">{room.legalActionReason}</p>
                                          </div>
                                      )}

                                      {/* Aksiyonlar */}
                                      <div className="flex flex-wrap gap-2 justify-end" onClick={e => e.stopPropagation()}>
                                          {/* YENİ: İCRA DOSYASI — yasal süreç hareketleri + dosya/foto/video. Son durum ve belge sayısı görünür. */}
                                          <button onClick={() => { setLegalProcForm(emptyLegalProcForm()); setLegalFileModalRoomId(room.id); }} className="flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                                              <FileTextIcon size={14} /> Yasal Süreç / Dosya
                                              {(() => { const lp = room.legalProcess || []; const lf = room.legalFiles || []; const last = lp.length ? [...lp].sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0))[0] : null; return (<>
                                                  {last && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white max-w-[130px] truncate">{last.status}</span>}
                                                  {lf.length > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-200 text-purple-800">{lf.length} belge</span>}
                                              </>); })()}
                                          </button>
                                          {/* YENİ: İcrayı Kaldır — odayı hiç icraya alınmamış gibi normale döndürür (onay penceresiyle). */}
                                          <button onClick={() => { if(!checkActionPerm('action-oda-icra')) return; setSelectedRoomId(room.id); setLegalActionData({ reason: '', type: 'stop' }); setIsLegalActionModalOpen(true); }} className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                                              <RefreshCcw size={14} /> İcrayı Kaldır
                                          </button>
                                          {cust && (
                                              <button onClick={() => { setActiveMenu('tum-musteriler'); setSelectedCustomerId(cust.id); }} className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                                                  <Wallet size={14} /> Carisine Git
                                              </button>
                                          )}
                                          <button onClick={() => { setActiveMenu('depo'); setSelectedWarehouseId(warehouse?.id); setSelectedBlockId(block?.id); setSelectedRoomId(room.id); }} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                                              <Box size={14} /> Odaya Git
                                          </button>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  );
              })()}
            </div>
          ) : activeMenu === 'kdvsiz-cariler' ? (
            <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Finans / Vergi Durumu</h1>
                  <h2 className="text-2xl font-bold text-slate-800">KDVsiz Cariler</h2>
                  <p className="text-sm text-gray-500 mt-1">Carisinde + KDV olmayan (KDV'siz) depoya sahip müşterilerin tam listesi.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center justify-between">
                  <div className="relative w-full sm:w-72">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={16} className="text-gray-400" /></div>
                      <input type="text" placeholder="Müşteri veya Oda Ara..." value={kdvsizSearchTerm} onChange={(e) => setKdvsizSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-50 shadow-sm font-medium" />
                  </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                  <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left text-sm text-gray-600 min-w-[800px]">
                          <thead className="bg-teal-50/50 border-b border-teal-100 text-xs uppercase text-teal-800 font-bold sticky top-0 z-10">
                              <tr>
                                  <th className="px-6 py-4">Müşteri</th>
                                  <th className="px-6 py-4">Oda / Blok</th>
                                  <th className="px-6 py-4 text-right">Aylık Kira (KDVsiz)</th>
                                  <th className="px-6 py-4 text-center w-32">İşlem</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {(() => {
                                  // YENİ EKLENEN: hasKdv === false olan (yani +KDV uygulanmayan) dolu odaları bul
                                  const kdvsizRooms = rooms.filter(r => r.customerName && r.hasKdv === false);
                                  const filteredKdvsiz = kdvsizRooms.filter(room =>
                                      room.customerName.toLowerCase().includes(kdvsizSearchTerm.toLowerCase()) ||
                                      room.name.toLowerCase().includes(kdvsizSearchTerm.toLowerCase())
                                  );

                                  if (filteredKdvsiz.length === 0) {
                                      return (
                                          <tr>
                                              <td colSpan="4" className="px-6 py-16 text-center">
                                                  <div className="w-16 h-16 bg-teal-50 text-teal-300 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner"><Wallet size={28} /></div>
                                                  <h3 className="text-lg font-bold text-gray-700 mb-1">KDVsiz Cari Bulunamadı</h3>
                                                  <p className="text-gray-500 font-medium text-sm">Şu anda + KDV uygulanmayan aktif bir kiralama kaydı bulunmuyor.</p>
                                              </td>
                                          </tr>
                                      );
                                  }

                                  return filteredKdvsiz.map((room) => {
                                      const customer = customers.find(c => c.name === room.customerName);
                                      const blockInfo = blocks.find(b => b.id === room.blockId);
                                      const warehouseInfo = blockInfo ? warehouses.find(w => w.id === blockInfo.warehouseId) : null;
                                      const baseAmount = Number(room.monthlyFee || 0);

                                      return (
                                          <tr key={room.id} className="hover:bg-gray-50 transition-colors">
                                              <td className="px-6 py-4">
                                                  <div className="font-bold text-gray-800 cursor-pointer hover:text-[#1bc5bd] hover:underline transition-colors" onClick={() => customer && setSelectedCustomerId(customer.id)}>{room.customerName}</div>
                                                  {customer && <div className="text-[10px] text-gray-400 mt-0.5">No: {customer.customerNo}</div>}
                                              </td>
                                              <td className="px-6 py-4 font-medium text-gray-600">{room.name} {warehouseInfo && <span className="text-gray-400">/ {warehouseInfo.name}</span>}</td>
                                              <td className="px-6 py-4 text-right font-extrabold text-teal-600 text-base">{baseAmount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</td>
                                              <td className="px-6 py-4 text-center">
                                                  <button onClick={() => customer && setSelectedCustomerId(customer.id)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm whitespace-nowrap">
                                                      Cariyi Gör
                                                  </button>
                                              </td>
                                          </tr>
                                      );
                                  });
                              })()}
                          </tbody>
                      </table>
                  </div>
              </div>
            </div>
          ) : activeMenu === 'gunu-gelen-odalar' ? (
            <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Finans / Ödeme Takibi</h1>
                  <h2 className="text-2xl font-bold text-slate-800">Günü Gelen Odalar</h2>
                  <p className="text-sm text-gray-500 mt-1">Belirlediğiniz günde ödemesi (kirası) gelen müşterilerin ve odalarının listesi.</p>
                </div>
              </div>

              {/* Date Navigation */}
              <div className="flex justify-center mb-8">
                  <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
                      <button onClick={() => {
                          const d = new Date(dueRoomsDate); d.setDate(d.getDate() - 1); setDueRoomsDate(d.toISOString().split('T')[0]);
                      }} className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-gray-600"><ArrowLeft size={18} /></button>
                      
                      <div className="flex flex-col items-center min-w-[220px]">
                          <span className="text-lg font-black text-indigo-700 flex items-center gap-2">
                              <Calendar size={18} />
                              {(() => {
                                  const d = new Date(dueRoomsDate);
                                  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                                  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
                                  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${days[d.getDay()]}`;
                              })()}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">İncelenen Tarih</span>
                      </div>

                      <button onClick={() => {
                          const d = new Date(dueRoomsDate); d.setDate(d.getDate() + 1); setDueRoomsDate(d.toISOString().split('T')[0]);
                      }} className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors text-gray-600"><ArrowLeft size={18} className="rotate-180" /></button>
                  </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                  <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left text-sm text-gray-600 min-w-[900px]">
                          <thead className="bg-indigo-50/50 border-b border-indigo-100 text-xs uppercase text-indigo-800 font-bold sticky top-0 z-10">
                              <tr>
                                  <th className="px-6 py-4 w-12">#</th>
                                  <th className="px-6 py-4">Müşteri Bilgisi</th>
                                  <th className="px-6 py-4">Oda / Blok</th>
                                  <th className="px-6 py-4 text-center">Ödeme Günü</th>
                                  <th className="px-6 py-4 text-right">Aylık Kira</th>
                                  <th className="px-4 py-4 text-center w-44">Hatırlat</th>
                                  <th className="px-6 py-4 text-center w-56">İşlem</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                             {(() => {
                                const targetDateObj = new Date(dueRoomsDate);
                                const targetDay = targetDateObj.getDate();

                                const dueRoomsList = rooms.filter(room => {
                                    if (!room.customerName) return false;
                                    // YENİ EKLENEN: İcra (yasal takip) sürecindeki odalar bu listede GÖSTERİLMEZ —
                                    // takipleri "İcra Odaları" sayfasından yapılır.
                                    if (room.isUnderLegalAction) return false;
                                    const entryD = parseDateLocal(room.entryDate || '2026-01-01');
                                    const paymentAnchorD = room.paymentDate && room.paymentDate.includes('-') ? parseDateLocal(room.paymentDate) : entryD;
                                    
                                    let pDay = paymentAnchorD.getDate();
                                    if (room.paymentDate && !room.paymentDate.includes('-')) {
                                        pDay = parseInt(room.paymentDate);
                                    }
                                    return pDay === targetDay;
                                });

                                if (dueRoomsList.length === 0) {
                                    return (
                                        <tr>
                                            <td colSpan="7" className="px-6 py-16 text-center">
                                                <div className="w-16 h-16 bg-indigo-50 text-indigo-300 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner"><Calendar size={28} /></div>
                                                <h3 className="text-lg font-bold text-gray-700 mb-1">Bu Güne Ait Oda Bulunamadı</h3>
                                                <p className="text-gray-500 font-medium text-sm">Seçili günde (Her ayın {targetDay}. günü) kirası gelen aktif bir oda bulunmuyor.</p>
                                            </td>
                                        </tr>
                                    );
                                }

                                return dueRoomsList.map((room, index) => {
                                    const customer = customers.find(c => c.name === room.customerName);
                                    const blockInfo = blocks.find(b => b.id === room.blockId);
                                    const warehouseInfo = blockInfo ? warehouses.find(w => w.id === blockInfo.warehouseId) : null;
                                    
                                    const baseAmount = Number(room.monthlyFee || 0);
                                    const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
                                    const monthlyTotal = hasKdv ? baseAmount * 1.20 : baseAmount;

                                    // YENİ EKLENDİ: Müşterinin borç kontrolü
                                    let hasDebt = false;
                                    if (customer) {
                                        const { balance } = getCustomerLedger(customer);
                                        hasDebt = balance > 0;
                                    }

                                    return (
                                        <tr key={room.id} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-6 py-4 font-bold text-gray-400">{index + 1}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-indigo-700 cursor-pointer hover:underline text-base flex items-center gap-2" onClick={() => customer && setSelectedCustomerId(customer.id)}>
                                                    {room.customerName}
                                                    {/* YENİ EKLENDİ: Borç Bildirim Rozeti */}
                                                    {hasDebt ? (
                                                        <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[9px] border border-red-200 uppercase tracking-wider whitespace-nowrap shadow-sm" title="Müşterinin ödenmemiş cari borcu bulunuyor">Borcu Var</span>
                                                    ) : (
                                                        <span className="bg-teal-100 text-teal-600 px-1.5 py-0.5 rounded text-[9px] border border-teal-200 uppercase tracking-wider whitespace-nowrap shadow-sm" title="Müşterinin güncel borcu yoktur">Borcu Yok</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-500 mt-0.5 font-medium flex items-center gap-1"><Phone size={10}/> {customer?.phone || room.phone || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-black text-gray-800 text-sm flex items-center gap-1.5"><Key size={14} className="text-gray-400"/> {room.name} <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px] font-bold border border-gray-200">{room.m3}m³</span></div>
                                                <div className="text-[10px] text-gray-500 mt-1 font-bold uppercase tracking-wider">{warehouseInfo?.name} / {blockInfo?.name}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
                                                    Her Ayın {targetDay}'i
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="font-extrabold text-emerald-600 text-base">{monthlyTotal.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</div>
                                                <div className="text-[10px] text-gray-400 font-bold">KDV Dahil</div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <a href={`tel:${customer?.phone || room.phone || ''}`} onClick={(e)=>e.stopPropagation()} className="w-9 h-9 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shadow-sm" title="Müşteriyi Ara"><Phone size={15}/></a>
                                                    <button onClick={() => customer ? handleOpenMessageModal(customer, monthlyTotal, 'reminder') : alert('Bu odaya kayıtlı müşteri bulunamadı.')} className="w-9 h-9 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm" title="Ödeme Hatırlat"><MessageCircle size={15}/></button>
                                                    <button onClick={() => customer ? handleOpenMessageModal(customer, monthlyTotal, 'warning') : alert('Bu odaya kayıtlı müşteri bulunamadı.')} className="w-9 h-9 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors shadow-sm" title="Uyarı Gönder"><AlertCircle size={15}/></button>
                                                    <button onClick={() => customer ? handleOpenMessageModal(customer, monthlyTotal, 'eviction') : alert('Bu odaya kayıtlı müşteri bulunamadı.')} className="w-9 h-9 flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm" title="Tahliye İhtarı"><Trash2 size={15}/></button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => customer && setSelectedCustomerId(customer.id)} className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5">
                                                        <Settings size={14}/> Cariye Git
                                                    </button>
                                                    <button onClick={() => { setActiveMenu('depo'); setSelectedWarehouseId(warehouseInfo?.id); setSelectedBlockId(room.blockId); setSelectedRoomId(room.id); setSelectedCustomerId(null); }} className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-indigo-500/30 flex items-center gap-1.5">
                                                        <Box size={14}/> Odaya Git
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                });
                             })()}
                          </tbody>
                      </table>
                  </div>
              </div>
            </div>
          ) : activeMenu === 'senesi-dolan-odalar' ? (
            <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Finans / Sözleşme</h1>
                  <h2 className="text-2xl font-bold text-slate-800">Senesi Dolan Odalar (Zam Yapılacaklar)</h2>
                  <p className="text-sm text-gray-500 mt-1">Seçili ay ve yıl itibarıyla depoya girişinin üzerinden 1 tam yıl veya daha fazla süre geçmiş müşteriler.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center justify-between">
                  <div className="relative w-full sm:w-72">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={16} className="text-gray-400" /></div>
                      <input type="text" placeholder="Müşteri veya Oda Ara..." value={anniversarySearchTerm} onChange={(e) => setAnniversarySearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 shadow-sm font-medium" />
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
                          <span className="text-xs font-bold text-gray-500 uppercase">İncelenen Ay:</span>
                          <select value={anniversaryMonth} onChange={(e) => setAnniversaryMonth(e.target.value)} className="py-2.5 text-sm focus:outline-none font-bold text-slate-700 bg-transparent cursor-pointer">
                              <option value="1">Ocak</option><option value="2">Şubat</option><option value="3">Mart</option><option value="4">Nisan</option>
                              <option value="5">Mayıs</option><option value="6">Haziran</option><option value="7">Temmuz</option><option value="8">Ağustos</option>
                              <option value="9">Eylül</option><option value="10">Ekim</option><option value="11">Kasım</option><option value="12">Aralık</option>
                          </select>
                      </div>
                      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
                          <span className="text-xs font-bold text-gray-500 uppercase">Yıl:</span>
                          <select value={anniversaryYear} onChange={(e) => setAnniversaryYear(e.target.value)} className="py-2.5 text-sm focus:outline-none font-bold text-slate-700 bg-transparent cursor-pointer">
                              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                                  <option key={y} value={y}>{y}</option>
                              ))}
                          </select>
                      </div>
                  </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                  <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left text-sm text-gray-600 min-w-[900px]">
                          <thead className="bg-indigo-50/50 border-b border-indigo-100 text-xs uppercase text-indigo-800 font-bold sticky top-0 z-10">
                              <tr>
                                  <th className="px-6 py-4">Oda / Blok</th>
                                  <th className="px-6 py-4">Müşteri Bilgisi</th>
                                  <th className="px-6 py-4 text-center">Giriş Tarihi</th>
                                  <th className="px-6 py-4 text-center">Geçen Süre</th>
                                  <th className="px-6 py-4 text-right">Mevcut Kira</th>
                                  <th className="px-6 py-4 text-center w-40">İşlem</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                             {(() => {
                                const rentedRooms = rooms.filter(r => r.customerName && r.entryDate);
                                const filteredAnniversaries = rentedRooms.filter(room => {
                                    const entryD = parseDateLocal(room.entryDate);
                                    const eMonth = entryD.getMonth() + 1;
                                    const eYear = entryD.getFullYear();
                                    
                                    // Sadece geçmiş yıllarda ve seçili ayda girenleri göster
                                    const isAnniversary = eMonth === parseInt(anniversaryMonth) && eYear < parseInt(anniversaryYear);
                                    const matchesSearch = room.customerName.toLowerCase().includes(anniversarySearchTerm.toLowerCase()) || room.name.toLowerCase().includes(anniversarySearchTerm.toLowerCase());
                                    
                                    return isAnniversary && matchesSearch;
                                }).map(room => {
                                    const entryD = parseDateLocal(room.entryDate);
                                    const yearsPassed = parseInt(anniversaryYear) - entryD.getFullYear();
                                    return { ...room, yearsPassed };
                                });

                                // En eski olanları en üste al (zam önceliği)
                                filteredAnniversaries.sort((a, b) => b.yearsPassed - a.yearsPassed);

                                if (filteredAnniversaries.length === 0) {
                                    return (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-16 text-center">
                                                <div className="w-16 h-16 bg-indigo-50 text-indigo-300 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner"><Calendar size={28} /></div>
                                                <h3 className="text-lg font-bold text-gray-700 mb-1">Zam Yapılacak Oda Bulunamadı</h3>
                                                <p className="text-gray-500 font-medium text-sm">Seçili ay ve yıla göre tam senesini dolduran aktif bir kiralama kaydı bulunmuyor.</p>
                                            </td>
                                        </tr>
                                    );
                                }

                                return filteredAnniversaries.map((room) => {
                                    const customer = customers.find(c => c.name === room.customerName);
                                    const blockInfo = blocks.find(b => b.id === room.blockId);
                                    const warehouseInfo = blockInfo ? warehouses.find(w => w.id === blockInfo.warehouseId) : null;
                                    
                                    // YENİ: Mevcut Kira = müşterinin carisine yansımış EN SON / EN YÜKSEK kira (zamlı kira dahil)
                                    const baseAmount = getRoomLatestFee(room);
                                    const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
                                    // DÜZELTİLDİ: Sonradan "KDV'li Yap" ile çevrilen odalarda saklanan tutar ZATEN
                                    // KDV DAHİL olduğu için burada tekrar ×1.20 yapılmaz (%20 şişme hatası giderildi).
                                    // getRoomLatestGrossFee her iki durumu da doğru hesaplar → cari ile birebir aynı.
                                    const monthlyTotal = getRoomLatestGrossFee(room);
                                    
                                    const hasBeenIncreased = room.priceHistory?.some(ph => ph.anniversaryYear === parseInt(anniversaryYear));

                                    // YENİ EKLENDİ: WhatsApp Zam Bilgilendirme Otomasyonu
                                    const sendIncreaseNotification = () => {
                                        const entryD = parseDateLocal(room.entryDate);
                                        const monthsStr = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                                        const entryDay = entryD.getDate();
                                        const entryMonth = monthsStr[entryD.getMonth()];

                                        const increaseRate = Number(collectionRates.roomIncreaseRate || 50);
                                        
                                        // Yeni kira hesaplamaları — DÜZELTİLDİ: zam artık ekranda görünen
                                        // KDV DAHİL "Mevcut Kira" (monthlyTotal) üzerinden hesaplanır; sonradan
                                        // KDV'li yapılan odalarda çift KDV uygulanması önlenir.
                                        const newTotalAmount = Math.round(monthlyTotal + (monthlyTotal * increaseRate / 100));
                                        const newBaseAmount = hasKdv ? Math.round(newTotalAmount / 1.20) : newTotalAmount;

                                        // Mesaj Şablonu
                                        let message = `Merhabalar Sayın ${customer?.name || room.customerName},\n\n`;
                                        message += `*${entryDay} ${entryMonth}* tarihinde depolama senemiz dolmaktadır.\n`;
                                        message += `Açıklanan enflasyon / sözleşme oranı *%${increaseRate}* olup, bu oranda zam yapılmıştır.\n\n`;

                                        if (hasKdv) {
                                             message += `Eski KDV Dahil Kiraniz: ${monthlyTotal.toLocaleString('tr-TR')} TL\n`;
                                             message += `Yeni depo kiranız *${newBaseAmount.toLocaleString('tr-TR')} TL + KDV*'dir. KDV dahil aylık kiranız *${newTotalAmount.toLocaleString('tr-TR')} TL* olmuştur.\n\n`;
                                        } else {
                                             message += `Eski Kiraniz: ${monthlyTotal.toLocaleString('tr-TR')} TL\n`;
                                             message += `Yeni aylık kiranız *${newTotalAmount.toLocaleString('tr-TR')} TL* olmuştur.\n\n`;
                                        }

                                        message += `Dilerseniz bitmeden eşyalarınızı alabilirsiniz.\n`;
                                        message += `Ya da otomatik olarak yeni kiradan deponuz güncellenecektir. Bilginize sunarız.`;

                                        // WhatsApp Yönlendirmesi
                                        const encodedText = encodeURIComponent(message);
                                        let waPhone = (customer?.phone || room.phone || '').replace(/\D/g, '');
                                        
                                        if (waPhone.length === 10) waPhone = '90' + waPhone;
                                        else if (waPhone.length === 11 && waPhone.startsWith('0')) waPhone = '90' + waPhone.substring(1);

                                        if(waPhone) {
                                            window.open(`https://wa.me/${waPhone}?text=${encodedText}`, '_blank');
                                        } else {
                                            alert("Bu müşteriye ait geçerli bir telefon numarası bulunamadı.");
                                        }
                                    };

                                    return (
                                        <tr key={room.id} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-black text-gray-800 text-base">{room.name}</div>
                                                <div className="text-[10px] text-gray-500 mt-0.5 font-bold uppercase tracking-wider">{warehouseInfo?.name} / {blockInfo?.name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => customer && setSelectedCustomerId(customer.id)}>{room.customerName}</div>
                                                <div className="text-[10px] text-gray-500 mt-0.5 font-medium flex items-center gap-1"><Phone size={10}/> {customer?.phone || room.phone || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">{room.entryDate}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border shadow-sm ${room.yearsPassed > 1 ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                    {room.yearsPassed}. Yılı Doldu
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="font-extrabold text-gray-800 text-base">{monthlyTotal.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</div>
                                                <div className="text-[10px] text-gray-400 font-bold">KDV Dahil</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {hasBeenIncreased ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <span className="bg-green-100 text-green-700 px-3 py-2 rounded-xl text-xs font-bold border border-green-200 flex items-center gap-1.5"><Check size={14}/> Zam Yapıldı</span>
                                                        {/* YENİ: Zam tutarını düzenle — yanlış girilen zam sonradan düzeltilebilir (modal tekrar açılır, doğru tutar üzerine yazılır) */}
                                                        <button onClick={() => { if(!checkActionPerm('action-zam-yap')) return; handleOpenApplyIncreaseModal(room, anniversaryYear); }} className="bg-amber-50 hover:bg-amber-100 text-amber-600 px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm border border-amber-200 flex items-center gap-1" title="Zam Tutarını Düzenle"><Edit size={14}/> Düzenle</button>
                                                        <button onClick={sendIncreaseNotification} className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm border border-blue-200 flex items-center gap-1" title="Zammı WhatsApp'tan Bildir"><MessageCircle size={14}/> Bildir</button>
                                                        <button onClick={() => { setActiveMenu('depo'); setSelectedWarehouseId(warehouseInfo?.id); setSelectedBlockId(room.blockId); setSelectedRoomId(room.id); setSelectedCustomerId(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm">Odaya Git</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => { setActiveMenu('depo'); setSelectedWarehouseId(warehouseInfo?.id); setSelectedBlockId(room.blockId); setSelectedRoomId(room.id); setSelectedCustomerId(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm">Odaya Git</button>
                                                        <button onClick={sendIncreaseNotification} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-blue-500/30 flex items-center gap-1.5" title="Zam oranını müşteriye WhatsApp'tan bildir"><MessageCircle size={14}/> Bilgilendir</button>
                                                        <button onClick={() => { if(!checkActionPerm('action-zam-yap')) return; handleOpenApplyIncreaseModal(room, anniversaryYear); }} className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-indigo-500/30">Zam Yap</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                });
                             })()}
                          </tbody>
                      </table>
                  </div>
              </div>
            </div>
          ) : activeMenu === 'hediye-verilen-odalar' ? (
            /* ============================================================
               YENİ SAYFA: HEDİYE VERİLEN ODALAR
               Hediye ay (giftMonths) kullanan TÜM odaları listeler.
               - Filtre: Bu Sene / Geçen Sene / Tüm Zamanlar (hediye ayının denk geldiği takvim yılı)
               - Her odanın kaç hediye ay aldığı ve hangi aylar olduğu görünür
               - "Odaya Git" ve "Carisine Git" butonları vardır
               ============================================================ */
            <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
              {(() => {
                  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                  const nowY = new Date().getFullYear();

                  // Hediye ayının denk geldiği takvim tarihi seçili aralıkta mı?
                  const inGiftRange = (d) => {
                      if (giftPageRange === 'all') return true;
                      if (giftPageRange === 'busene') return d.getFullYear() === nowY;
                      if (giftPageRange === 'gecensene') return d.getFullYear() === nowY - 1;
                      return true;
                  };

                  // ODA BAZLI HEDİYE LİSTESİ
                  // Her oda için hediye aylarının takvim tarihleri hesaplanır (giriş/ödeme çapasından
                  // giftStartMonthIndex + k ay sonrası). Filtreye uyan aylar satırda gösterilir.
                  const giftRooms = rooms.map(room => {
                      const gm = Number(room.giftMonths || 0);
                      if (gm <= 0 || !room.entryDate) return null;
                      const entryD = parseAnyDate(room.entryDate);
                      if (!entryD) return null;
                      // Ödeme günü çapası varsa onu kullan (ay sonu 29/30/31 kaymalarında ay-1 mantığı ile güvenli)
                      const anchorD = room.paymentDate && String(room.paymentDate).includes('-') ? (parseAnyDate(room.paymentDate) || entryD) : entryD;
                      const startIdx = Number(room.giftStartMonthIndex || 0);
                      const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;

                      const giftMonthsList = [];
                      let rangeValue = 0; // filtreye uyan hediye aylarının kira karşılığı (KDV dahil)
                      for (let k = 0; k < gm; k++) {
                          const mc = startIdx + k;
                          // new Date(yıl, ay + mc, 1) → ay taşması JS tarafından otomatik yönetilir (yıl geçişi güvenli)
                          const giftDate = new Date(anchorD.getFullYear(), anchorD.getMonth() + mc, 1);
                          if (!inGiftRange(giftDate)) continue;
                          const base = Number(getRoomFeeForMonth(room, giftDate.getFullYear(), giftDate.getMonth()) || room.monthlyFee || 0);
                          const total = hasKdv ? base * 1.20 : base;
                          rangeValue += total;
                          giftMonthsList.push({ label: `${monthNames[giftDate.getMonth()]} ${giftDate.getFullYear()}`, amount: total, dateObj: giftDate });
                      }
                      if (giftMonthsList.length === 0) return null; // bu odanın hediyesi seçili döneme denk gelmiyor

                      const block = blocks.find(b => b.id === room.blockId);
                      const warehouse = warehouses.find(w => w.id === block?.warehouseId);
                      const cust = customers.find(c => c.name === room.customerName);
                      return {
                          room, block, warehouse, cust,
                          totalGiftMonths: gm,                       // odaya verilen TOPLAM hediye ay
                          rangeGiftMonths: giftMonthsList.length,    // seçili dönemdeki hediye ay adedi
                          giftMonthsList, rangeValue,
                          isActive: !!room.customerName              // oda hâlâ kirada mı?
                      };
                  }).filter(Boolean)
                    // Arama: müşteri adı veya oda adı
                    .filter(g => {
                        const q = giftPageSearch.trim().toLocaleLowerCase('tr');
                        if (!q) return true;
                        return String(g.room.name || '').toLocaleLowerCase('tr').includes(q)
                            || String(g.room.customerName || '').toLocaleLowerCase('tr').includes(q);
                    })
                    // En yeni hediye ayı en üstte
                    .sort((a, b) => (b.giftMonthsList[0]?.dateObj || 0) - (a.giftMonthsList[0]?.dateObj || 0));

                  // ÖZET KARTLAR
                  const sumRooms = giftRooms.length;
                  const sumMonths = giftRooms.reduce((acc, g) => acc + g.rangeGiftMonths, 0);
                  const sumValue = giftRooms.reduce((acc, g) => acc + g.rangeValue, 0);
                  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
                  const rangeLabel = giftPageRange === 'busene' ? `${nowY}` : giftPageRange === 'gecensene' ? `${nowY - 1}` : 'Tüm Zamanlar';

                  return (
                      <>
                        {/* BAŞLIK */}
                        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Ödeme İşlemleri</h1>
                            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Gift size={24} className="text-pink-500" /> Hediye Verilen Odalar</h2>
                            <p className="text-sm text-gray-500 mt-1">Hediye ay kullanan tüm odalar, aldıkları hediye ay sayısı ve hangi aylara denk geldiği.</p>
                          </div>
                        </div>

                        {/* ARAMA + TARİH FİLTRESİ */}
                        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center justify-between">
                            <div className="relative w-full sm:w-72">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={16} className="text-gray-400" /></div>
                                <input type="text" placeholder="Müşteri veya Oda Ara..." value={giftPageSearch} onChange={(e) => setGiftPageSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-50 shadow-sm font-medium" />
                            </div>
                            {/* Bu Sene / Geçen Sene / Tüm Zamanlar */}
                            <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm w-full sm:w-auto">
                                {[['busene', 'Bu Sene'], ['gecensene', 'Geçen Sene'], ['all', 'Tüm Zamanlar']].map(([val, label]) => (
                                    <button key={val} onClick={() => setGiftPageRange(val)} className={`px-4 py-2.5 text-sm font-bold transition-colors flex-1 sm:flex-none border-l border-gray-200 first:border-l-0 ${giftPageRange === val ? 'bg-pink-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{label}</button>
                                ))}
                            </div>
                        </div>

                        {/* ÖZET — kompakt tek satır (mobilde de yer kaplamaz) */}
                        <div className="flex gap-3 mb-4">
                            <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hediye Verilen Oda</p>
                                <p className="text-xl font-black text-slate-800">{sumRooms} <span className="text-[11px] font-bold text-gray-400">/ {rangeLabel}</span></p>
                            </div>
                            <div className="flex-1 bg-white rounded-xl border border-pink-100 shadow-sm px-4 py-3">
                                <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">Toplam Hediye Ay</p>
                                <p className="text-xl font-black text-pink-600">{sumMonths} Ay</p>
                            </div>
                        </div>

                        {/* LİSTE — KOMPAKT. Satır yüksekliği küçüktür, 73 kaydın tamamı liste halinde akar.
                            Uzun listede sayfayı şişirmemek için liste kendi içinde kaydırılabilir (max-h). */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            {/* Sonuç adedi bilgisi — kaç kaydın listelendiği net görünür */}
                            <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-100 flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Hediye Kullanan Odalar</span>
                                <span className="text-[11px] font-black text-pink-600">{giftRooms.length} kayıt</span>
                            </div>
                            {giftRooms.length === 0 ? (
                                <div className="p-10 text-center">
                                    <Gift size={32} className="text-gray-200 mx-auto mb-2" />
                                    <p className="text-sm font-bold text-gray-400">Seçili dönemde hediye ay kullanan oda bulunamadı.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
                                    {giftRooms.map(g => (
                                        <div key={g.room.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-pink-50/30 transition-colors">
                                            {/* Hediye ay adedi — küçük pembe kutu */}
                                            <div className="w-9 h-9 bg-pink-100 text-pink-600 rounded-lg flex flex-col items-center justify-center border border-pink-200 shrink-0 leading-none">
                                                <span className="font-black text-[13px]">{g.rangeGiftMonths}</span>
                                                <span className="text-[7px] font-bold">AY</span>
                                            </div>

                                            {/* Oda + müşteri + hediye ayları — tek blokta, dar satırda */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                                                    <span className="font-bold text-slate-800 text-[13px]">{g.room.name}</span>
                                                    <span className="text-gray-300 text-[11px]">•</span>
                                                    {/* Müşteri adı → carisine gider */}
                                                    <button onClick={() => { if (g.cust) { setActiveMenu('tum-musteriler'); setSelectedCustomerId(g.cust.id); setSelectedRoomId(null); } }}
                                                        className={`text-[12px] font-bold truncate max-w-[150px] sm:max-w-none ${g.cust ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-gray-500 cursor-default'}`}
                                                        title={g.cust ? 'Müşterinin carisine git' : 'Cari bulunamadı'}>
                                                        {g.room.customerName || '— Müşteri yok —'}
                                                    </button>
                                                    {!g.isActive && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">ÇIKMIŞ</span>}
                                                </div>
                                                <div className="text-[10px] text-gray-500 font-bold mt-0.5 flex items-center gap-1.5 flex-wrap leading-tight">
                                                    <span>{g.warehouse?.name || '-'}</span>
                                                    <span className="text-gray-300">•</span>
                                                    <span>{fmt(g.room.monthlyFee)} TL</span>
                                                    <span className="text-gray-300">•</span>
                                                    <span className="text-pink-600">Toplam {g.totalGiftMonths} Ay</span>
                                                </div>
                                                {/* HEDİYE AYLARI — hangi aylar hediye kullanıldı (kompakt etiketler) */}
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {g.giftMonthsList.map((m, i) => (
                                                        <span key={i} className="text-[9px] font-bold bg-pink-50 text-pink-700 border border-pink-100 px-1.5 py-0.5 rounded">
                                                            {m.label}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* SAĞ: küçük ikon butonlar (Carisine Git / Odaya Git) */}
                                            <div className="flex gap-1.5 shrink-0">
                                                <button onClick={() => { if (g.cust) { setActiveMenu('tum-musteriler'); setSelectedCustomerId(g.cust.id); setSelectedRoomId(null); } }}
                                                    disabled={!g.cust}
                                                    title="Carisine Git"
                                                    className={`p-2 rounded-lg transition-colors ${g.cust ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-50 text-gray-300 cursor-not-allowed'}`}>
                                                    <Users size={14} />
                                                </button>
                                                <button onClick={() => { setActiveMenu('depo'); setSelectedWarehouseId(g.warehouse?.id); setSelectedBlockId(g.room.blockId); setSelectedRoomId(g.room.id); setSelectedCustomerId(null); }}
                                                    title="Odaya Git"
                                                    className="p-2 rounded-lg bg-pink-500 hover:bg-pink-600 text-white transition-colors">
                                                    <Box size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                      </>
                  );
              })()}
            </div>
          ) : activeMenu === 'depo' && selectedRoomId ? (
            <div className="max-w-7xl mx-auto flex flex-col h-full bg-slate-50 relative">
                <div className="bg-slate-50 w-full animate-in fade-in duration-300 pb-16">
                  {/* Üst geri linki */}
                  <button onClick={() => setSelectedRoomId(null)} className="text-[10px] font-bold text-gray-400 hover:text-[#1bc5bd] tracking-widest uppercase mb-3 flex items-center gap-1 transition-colors"><ArrowLeft size={12} /> {warehouses.find(w=>w.id===selectedWarehouseId)?.name} - {blocks.find(b=>b.id===selectedBlockId)?.name}</button>
                  {/* GÜNCELLENDİ: Oda adı ve m³ ortada, çerçeveli kart; oda no şube rengiyle (teal) aynı; göz butonuyla giriş görseli */}
                  <div className="mb-6 flex justify-center">
                    <div className="relative inline-flex flex-col items-center gap-1 bg-white border border-[#1bc5bd]/30 rounded-2xl px-8 py-4 shadow-sm">
                       {/* Göz butonu — oda listesindeki göz ile AYNI görseli/görüntüleyiciyi açar (roomListPhoto) */}
                       <button onClick={() => setRoomPhotoViewer(selectedRoomDetail?.id)} title="Oda Fotoğrafı" className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors bg-teal-50 hover:bg-teal-100 text-[#1bc5bd] border border-teal-200"><Eye size={16}/></button>
                       <div className="flex items-center gap-2 text-[#1bc5bd]"><Box size={20}/><span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Oda</span></div>
                       <h2 className="text-3xl font-extrabold text-[#1bc5bd] tracking-tight text-center">{selectedRoomDetail?.name}</h2>
                       {/* YENİ: m³ rozetinin SOLUNDA oda ölçüleri (en×boy×yükseklik) gösterilir */}
                       <div className="flex items-center gap-1.5 flex-wrap justify-center">
                          {formatRoomDims(selectedRoomDetail) && (
                             <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 flex items-center gap-1" title="En × Boy × Yükseklik">
                                <MoveHorizontal size={12} className="text-slate-400"/> {formatRoomDims(selectedRoomDetail)}
                             </span>
                          )}
                          {/* YENİ: Odada kolon varsa düşülen hacim rozeti */}
                          {selectedRoomDetail?.columnM3 > 0 && (
                             <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1" title={`Brüt ${String(selectedRoomDetail.grossM3 ?? '').replace('.', ',')} m³ — kolon düşüldü`}>
                                <Columns size={12}/> Kolon −{String(selectedRoomDetail.columnM3).replace('.', ',')} m³
                             </span>
                          )}
                          <span className="text-sm font-bold text-[#1bc5bd] bg-teal-50 px-3 py-0.5 rounded-full border border-teal-100">{displayRoomM3(selectedRoomDetail)} m³</span>
                       </div>
                    </div>
                  </div>
{(() => {
                      const customerRooms = rooms.filter(r => r.customerName === selectedRoomDetail?.customerName); // EKLENDİ: eksikti, beyaz ekran hatasına sebep oluyordu
                      const roomsUnderLegalAction = customerRooms?.filter(r => r.isUnderLegalAction) || [];
                      const roomsWithPastLegalAction = customerRooms?.filter(r => !r.isUnderLegalAction && r.legalActionHistory?.some(h => h.type === 'stop')) || [];
                      
                      return (
                          <>
                              {selectedRoomDetail?.isUnderLegalAction && (
                                  <div className="mb-6 p-4 rounded-xl border flex flex-col gap-2 shadow-sm bg-red-100 border-red-400 text-red-800 animate-pulse">
                                      <div className="flex items-center gap-2">
                                          <AlertCircle size={20} />
                                          <h4 className="font-bold text-sm">DİKKAT: Müşterinin İcra (Yasal Takip) Sürecinde Olan Odaları Var!</h4>
                                      </div>
                                      <ul className="text-xs font-medium opacity-90 ml-7 list-disc">
                                          {roomsUnderLegalAction.map(r => (
                                              <li key={r.id}><strong>{r.name} Odası:</strong> {r.legalActionReason} <span className="font-bold border-b border-red-500">(Bu odalarda kira borçlandırması devam etmektedir)</span></li>
                                          ))}
                                      </ul>
                                  </div>
                              )}
                              {!selectedRoomDetail?.isUnderLegalAction && selectedRoomDetail?.legalActionHistory?.some(h => h.type === 'stop') && (
                                  <div className="mb-6 p-4 rounded-xl border flex items-start gap-3 shadow-sm bg-gray-50 border-gray-200 text-gray-600">
                                      <div className="mt-0.5"><Info size={20} /></div>
                                      <div>
                                          <h4 className="font-bold text-sm mb-1">Bilgi Notu: Geçmiş İcra İşlemi</h4>
                                          <p className="text-xs font-medium opacity-90 leading-relaxed">
                                              Bu müşterinin bazı odaları ({roomsWithPastLegalAction.map(r=>r.name).join(', ')}) için daha önce icra işlemi başlatılmış ve sonrasında kaldırılmıştır.
                                          </p>
                                      </div>
                                  </div>
                              )}
                          </>
                      );
                  })()}
                  {selectedRoomDetail?.customerName && (
                     <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 shadow-sm ${customerTotalBalance > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-teal-50 border-teal-200 text-teal-700'}`}>
                        <div className="mt-0.5">
                           {customerTotalBalance > 0 ? <AlertCircle size={20} /> : <Check size={20} />}
                        </div>
                        <div>
                           <h4 className="font-bold text-sm mb-1">{customerTotalBalance > 0 ? 'DİKKAT: Müşterinin Cari Borcu Bulunmaktadır!' : 'BİLGİ: Müşterinin Cari Borcu Yoktur'}</h4>
                           <p className="text-xs font-medium opacity-90 leading-relaxed">
                             {customerTotalBalance > 0
                                ? `Müşterinin güncel toplam cari bakiyesi ${customerTotalBalance.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL'dir. Lütfen borç kapanana kadar yeni randevu oluşturmayınız veya nakliye hizmeti vermeyiniz.`
                                : 'Müşterinin şu anda herhangi bir ödenmemiş cari borcu bulunmamaktadır. İşlemlerinize sorunsuz devam edebilirsiniz.'}
                           </p>
                        </div>
                     </div>
                  )}

                  {selectedRoomDetail?.movedFrom && selectedRoomDetail?.customerName && (
                     <div className="mb-6 p-4 rounded-xl border flex items-start gap-3 shadow-sm bg-indigo-50 border-indigo-200 text-indigo-700">
                        <div className="mt-0.5"><Info size={20} /></div>
                        <div>
                           <h4 className="font-bold text-sm mb-1">Oda Değişikliği Bilgisi</h4>
                           <p className="text-xs font-medium opacity-90 leading-relaxed">
                             Bu müşteri <strong>{selectedRoomDetail.movedFrom}</strong> odasından buraya taşınmıştır. Eski oda bilgileri ve işlemleri bu odaya başarıyla aktarıldı.
                           </p>
                        </div>
                     </div>
                  )}

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
                     {(!selectedRoomDetail?.customerName && (!selectedRoomDetail?.isReserved || selectedRoomDetail?.reserveExpiryTimestamp < Date.now())) ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                           <div className="w-20 h-20 bg-blue-50 text-[#1bc5bd] rounded-full flex items-center justify-center mb-5"><Home size={40} strokeWidth={1.5} /></div>
                           <h3 className="text-xl font-bold text-gray-800 mb-2">Bu Oda Şu An Boş</h3><p className="text-sm text-gray-500 mb-8 max-w-md">Bu odaya henüz bir müşteri tanımlanmamış. Hemen yeni bir kiralama başlatabilir veya odayı opsiyonlayabilirsiniz.</p>
                           <div className="flex gap-4">
                              <button onClick={() => setIsRentRoomModalOpen(true)} className="bg-[#1bc5bd] hover:bg-teal-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 shadow-sm"><Key size={18} /> Odayı Kirala (Yeni Kayıt)</button>
                              <button onClick={() => setIsReserveRoomModalOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"><Calendar size={18} /> Bu Odayı Rezerve Et</button>
                              <button onClick={() => setIsRoomHistoryModalOpen(true)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"><History size={18} /> Oda Geçmişini Gör</button>
                           </div>
                        </div>
                     ) : (selectedRoomDetail?.isReserved && !selectedRoomDetail?.customerName && selectedRoomDetail?.reserveExpiryTimestamp > Date.now()) ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                           <div className="w-20 h-20 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mb-5"><Clock size={40} strokeWidth={1.5} /></div>
                           <h3 className="text-xl font-bold text-gray-800 mb-2">Bu Oda Rezerve Edilmiş</h3><p className="text-sm text-gray-500 mb-4 max-w-md">Bu oda <strong>{selectedRoomDetail.reservedName}</strong> ({selectedRoomDetail.reservedPhone}) adına rezerve edilmiştir. Son geçerlilik tarihi: <strong>{selectedRoomDetail.reserveExpiry}</strong></p>
                           <div className="flex gap-4 mt-4">
                              <button onClick={() => setIsRentRoomModalOpen(true)} className="bg-[#1bc5bd] hover:bg-teal-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 shadow-sm"><Key size={18} /> Rezerveyi Kiralamaya Çevir</button>
                              <button onClick={handleCancelReservation} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"><X size={18} /> Rezerveyi İptal Et</button>
                           </div>
                        </div>
                     ) : (
                        <>
                           <div className="mb-8 border border-gray-200 rounded-2xl p-6 shadow-sm bg-gradient-to-br from-white to-slate-50/50">
                              <div className="flex flex-wrap justify-between items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                                 <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2"><Box size={16} className="text-[#1bc5bd]"/> Oda Bilgileri</h3>
                                 {/* GÜNCELLENDİ: 3 hızlı işlem butonu yan yana eşit boyutlandırıldı (Giriş Düzenle / Oda İcra / Oda Geçmişi) */}
                                 <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                                    <button onClick={() => { 
                                       if(!checkActionPerm('action-giris-bilgi-duzenle')) return;
                                       setEditRentData({
                                         customerName: selectedRoomDetail.customerName || '', entryDate: selectedRoomDetail.entryDate || '', paymentDate: selectedRoomDetail.paymentDate || '', monthlyFee: selectedRoomDetail.monthlyFee || '', hasKdv: selectedRoomDetail.hasKdv !== undefined ? selectedRoomDetail.hasKdv : true, sealNo: selectedRoomDetail.sealNo || '', broughtBy: selectedRoomDetail.broughtBy || 'kendisi', teamList: selectedRoomDetail.teamList || ''
                                       }); setIsEditRentModalOpen(true); 
                                    }} className="flex items-center justify-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:shadow-sm text-center"><Edit size={14} className="shrink-0"/> Giriş Bilgilerini Düzenle</button>
                                    {selectedRoomDetail?.isUnderLegalAction ? (
                                       <button onClick={() => { setLegalActionData({ reason: '', type: 'stop' }); setIsLegalActionModalOpen(true); }} className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:shadow-sm text-center"><Shield size={14} className="shrink-0"/> İcrayı Kaldır</button>
                                    ) : (
                                       <button onClick={() => { if(!checkActionPerm('action-oda-icra')) return; setLegalActionData({ reason: '', type: 'start' }); setIsLegalActionModalOpen(true); }} className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:shadow-sm text-center"><Shield size={14} className="shrink-0"/> Oda İcra</button>
                                    )}
                                    {/* YENİ: Oda Geçmişi (eski üstteki "Depo Geçmişi" butonu buraya taşındı) */}
                                    <button onClick={() => setIsRoomHistoryModalOpen(true)} className="flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:shadow-sm text-center"><Clock size={14} className="shrink-0"/> Oda Geçmişi</button>
                                 </div>
                              </div>

                              {/* Oda Sözleşmesi bloğu — 3 buton tek satırda yan yana, kompakt ve tam yatay hizalı */}
                              {selectedRoomDetail?.customerName && (
                                <div className="mb-5 rounded-xl p-3 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 shadow-sm">
                                   {/* Başlık: ikon + metin yatay, küçültülmüş */}
                                   <div className="flex items-center gap-1.5 mb-2.5">
                                      <div className="w-6 h-6 rounded-md bg-violet-600 text-white flex items-center justify-center shrink-0"><FileTextIcon size={13}/></div>
                                      <h4 className="text-xs font-bold text-violet-800 tracking-wide">Oda Sözleşmesi</h4>
                                   </div>
                                   {/* 3 buton yan yana — ikon + kısa metin YATAY hizada, ince ve kompakt */}
                                   <div className="grid grid-cols-3 gap-1.5">
                                      {/* Güncel sözleşmeyi indir */}
                                      <button onClick={handleDownloadRoomCurrentContract} title="Güncel Kira ile İndir" className="flex items-center justify-center gap-1 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white rounded-lg py-1.5 px-2 transition-all shadow-sm shadow-violet-500/30">
                                         <Download size={13} className="shrink-0"/>
                                         <span className="text-[10px] font-bold whitespace-nowrap">İndir</span>
                                      </button>
                                      {/* YENİ: "Yazdır" yerine "Sözleşme Yükle" — birden fazla dosya seçilebilir.
                                          Kayıt ekranındaki sözleşme mantığıyla aynı şekilde müşterinin cari
                                          Sözleşmeler'ine (contracts) kaydedilir. Yükleme sonrası buton etiketi
                                          yüklü dosya sayısını gösterir (buton "değişir"). */}
                                      <label title="Sözleşme Yükle (birden fazla dosya seçilebilir)" className="cursor-pointer flex items-center justify-center gap-1 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 active:scale-95 rounded-lg py-1.5 px-2 transition-all">
                                         {(() => { const _c = customers.find(c => c.name === selectedRoomDetail?.customerName); const n = (_c?.contracts || []).filter(k => String(k.roomId) === String(selectedRoomDetail?.id)).length; return (<><Upload size={13} className="shrink-0"/><span className="text-[10px] font-bold whitespace-nowrap">{n > 0 ? `Yükle (${n})` : 'Yükle'}</span></>); })()}
                                         <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const fl = e.target.files; e.target.value = ''; await handleUploadRoomContracts(fl); }}/>
                                      </label>
                                      {/* WhatsApp üzerinden paylaş */}
                                      <button onClick={handleShareRoomCurrentContract} title="WhatsApp'tan Paylaş" className="flex items-center justify-center gap-1 bg-green-500 hover:bg-green-600 active:scale-95 text-white rounded-lg py-1.5 px-2 transition-all shadow-sm shadow-green-500/30">
                                         <MessageCircle size={13} className="shrink-0"/>
                                         <span className="text-[10px] font-bold whitespace-nowrap">Paylaş</span>
                                      </button>
                                   </div>
                                   {/* YENİ: Yüklenen oda sözleşmelerini göster (aç). Her dosya için ayrı "Göster" butonu.
                                       Yalnızca en az bir dosya yüklendiyse görünür. */}
                                   {(() => {
                                       const _c = customers.find(c => c.name === selectedRoomDetail?.customerName);
                                       const roomContracts = (_c?.contracts || []).filter(k => String(k.roomId) === String(selectedRoomDetail?.id)).sort((a, b) => b.id - a.id);
                                       if (roomContracts.length === 0) return null;
                                       return (
                                         <div className="mt-2 pt-2 border-t border-violet-100">
                                            <div className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1.5">Yüklü Sözleşmeler ({roomContracts.length})</div>
                                            <div className="flex flex-wrap gap-1.5">
                                               {roomContracts.map((k, idx) => (
                                                 <a key={k.id} href={k.file} target="_blank" rel="noreferrer" title={`${k.label} • ${new Date(k.date).toLocaleDateString('tr-TR')}`} className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white rounded-lg py-1 px-2.5 transition-all shadow-sm shadow-violet-500/30">
                                                    <Eye size={12} className="shrink-0"/>
                                                    <span className="text-[10px] font-bold whitespace-nowrap">Göster{roomContracts.length > 1 ? ` ${idx + 1}` : ''}</span>
                                                 </a>
                                               ))}
                                            </div>
                                         </div>
                                       );
                                   })()}
                                </div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[11px] text-gray-500 font-semibold">Ad Soyad</label>
                                  <div onClick={() => { const cust = customers.find(c => c.name === selectedRoomDetail?.customerName); if (cust) { setSelectedCustomerId(cust.id); } }} className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-[#1bc5bd] font-bold cursor-pointer hover:underline transition-all">
                                    {selectedRoomDetail?.customerName || ''}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1.5"><label className="text-[11px] text-gray-500 font-semibold">Giriş Tarihi</label><input type="text" readOnly value={selectedRoomDetail?.entryDate || '01.01.2026'} className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 font-medium" /></div>
                                <div className="flex flex-col gap-1.5">
                                   <label className="text-[11px] text-gray-500 font-semibold">Mühür Numarası</label>
                                   {selectedRoomDetail?.sealNo ? (
                                       <input type="text" readOnly value={selectedRoomDetail.sealNo} className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 font-medium" />
                                   ) : (
                                       /* YENİ: Mühür numarası girilmemişse gerçek değer yerine önizleme metni gösterilir */
                                       <input type="text" readOnly value="DE-21322" title="Henüz mühür numarası girilmemiş — bu bir önizlemedir" className="border border-dashed border-gray-300 bg-gray-50 rounded px-3 py-2 text-sm text-gray-400 italic font-medium" />
                                   )}
                                </div>
                                {/* YENİ: Telefon Numarası alanı kaldırıldı — bunun yerine carideki numaradan doğrudan Ara / WhatsApp butonları */}
                                <div className="flex flex-col gap-1.5">
                                   <label className="text-[11px] text-gray-500 font-semibold">Telefon</label>
                                   {(() => {
                                       const roomCust = customers.find(c => c.name === selectedRoomDetail?.customerName);
                                       const rawPhone = roomCust?.phone || '';
                                       const cleanPhone = rawPhone.replace(/\D/g, '');
                                       if (!cleanPhone) {
                                           return <div className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-400 italic font-medium">Müşteri telefonu bulunamadı</div>;
                                       }
                                       // Carideki numara 0 ile başlıyorsa WhatsApp linki için ülke kodu ile değiştirilir
                                       const waPhone = '90' + cleanPhone.replace(/^0+/, '');
                                       return (
                                           <div className="flex gap-2">
                                               <a href={`tel:${cleanPhone}`} className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 px-3 py-2 rounded-lg text-xs font-bold transition-colors"><Phone size={13}/> Ara</a>
                                               <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-600 border border-green-100 px-3 py-2 rounded-lg text-xs font-bold transition-colors"><MessageCircle size={13}/> WhatsApp</a>
                                           </div>
                                       );
                                   })()}
                                </div>
                                
                                {/* VEKALET EDEN BİLGİSİ (ODA EKRANI) */}
                                {(() => {
                                    const roomCustomer = customers.find(c => c.name === selectedRoomDetail?.customerName);
                                    if (roomCustomer?.hasProxy) {
                                        return (
                                            <div className="md:col-span-2 mt-2 bg-indigo-50 border border-indigo-100 rounded-xl p-4 shadow-sm flex flex-col gap-3">
                                                <h4 className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider border-b border-indigo-100 pb-2 flex items-center gap-2"><Shield size={14}/> Vekalet Eden Kişi (Vekil) Bilgileri</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                    <div className="flex flex-col gap-1"><span className="text-[10px] text-indigo-400 font-bold uppercase">Ad Soyad</span><span className="text-sm font-semibold text-indigo-900">{roomCustomer.proxyName}</span></div>
                                                    <div className="flex flex-col gap-1"><span className="text-[10px] text-indigo-400 font-bold uppercase">Telefon</span><span className="text-sm font-semibold text-indigo-900">{roomCustomer.proxyPhone}</span></div>
                                                    <div className="flex flex-col gap-1"><span className="text-[10px] text-indigo-400 font-bold uppercase">TC Kimlik</span><span className="text-sm font-semibold text-indigo-900">{roomCustomer.proxyTc || '-'}</span></div>
                                                    {roomCustomer.proxyDocumentPhoto && (
                                                        <div className="md:col-span-3 mt-1">
                                                            <a href={roomCustomer.proxyDocumentPhoto} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline flex w-max gap-1 items-center"><FileTextIcon size={12}/> Vekil Kimlik Belgesini Görüntüle</a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                <div className="flex flex-col gap-1.5 md:col-span-2 mt-2"><h4 className="text-[11px] font-bold text-gray-400 uppercase border-b border-gray-200 pb-1">Ekstra Kiralama Bilgileri</h4></div>
                                <div className="flex flex-col gap-1.5"><label className="text-[11px] text-gray-500 font-semibold">İşlemi Yapan Yetkili</label><input type="text" readOnly value={selectedRoomDetail?.rentedBy || 'Bilinmiyor'} className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 font-medium" /></div>
                                <div className="flex flex-col gap-1.5"><label className="text-[11px] text-gray-500 font-semibold">Eşyayı Getiren</label><input type="text" readOnly value={selectedRoomDetail?.broughtBy === 'sembol' ? 'Sembol Nakliyat' : 'Müşteri Kendisi'} className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 font-medium" /></div>
                                {/* YENİ: "Hasar Durumu" gösterimi kaldırıldı — yerine HER ZAMAN görünen, düzenlenebilir Not bölümü */}
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                   <div className="flex items-center justify-between">
                                      <label className="text-[11px] text-gray-500 font-semibold">Not</label>
                                      {!isEditingRoomNote && (
                                          <button onClick={() => { setRoomNoteDraft(selectedRoomDetail?.roomNote || ''); setIsEditingRoomNote(true); }} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-1"><Edit size={11}/> Düzenle</button>
                                      )}
                                   </div>
                                   {isEditingRoomNote ? (
                                       <div className="flex flex-col gap-2">
                                          <textarea rows="3" value={roomNoteDraft} onChange={(e) => setRoomNoteDraft(e.target.value)} placeholder="Duruma göre not ekleyin (örn: eşyada hasar var, geç ödeme yapıyor, özel anlaşma vb.)" className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none font-medium text-gray-700 bg-indigo-50/30"></textarea>
                                          <div className="flex gap-2 justify-end">
                                             <button onClick={() => setIsEditingRoomNote(false)} className="text-xs font-bold text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">İptal</button>
                                             <button onClick={() => handleUpdateRoomNote(roomNoteDraft)} className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition-colors">Kaydet</button>
                                          </div>
                                       </div>
                                   ) : (
                                       <div className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 font-medium min-h-[42px] whitespace-pre-wrap">
                                          {selectedRoomDetail?.roomNote || <span className="text-gray-400 italic">Not eklenmemiş.</span>}
                                       </div>
                                   )}
                                </div>
                                {/* YENİ: Oda İlk Giriş Görseli — HER ZAMAN görünür; ekle/değiştir/sil; altında tarih + ekleyen ismi */}
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                   <label className="text-[11px] text-gray-500 font-semibold flex items-center justify-between">
                                      <span>Oda İlk Giriş Görseli</span>
                                      {/* YENİ: Düzenleme butonu — tıklanınca Değiştir/Sil butonları görünür/gizlenir (yalnızca görsel varken) */}
                                      {selectedRoomDetail?.entryPhoto && (
                                        <button onClick={() => setIsEditingEntryMedia(!isEditingEntryMedia)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${isEditingEntryMedia ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-500 border border-gray-200'}`} title="Düzenle"><Edit size={11}/> {isEditingEntryMedia ? 'Bitir' : 'Düzenle'}</button>
                                      )}
                                   </label>
                                   {selectedRoomDetail?.entryPhoto ? (
                                       <div className="border border-gray-200 rounded-lg p-3 bg-white flex flex-col gap-2 w-max max-w-full">
                                          <a href={selectedRoomDetail.entryPhoto} target="_blank" rel="noreferrer" className="block">
                                             {selectedRoomDetail.entryMediaType === 'video'
                                                ? <video src={selectedRoomDetail.entryPhoto} controls className="h-40 max-w-xs object-contain rounded bg-black" />
                                                : <img src={selectedRoomDetail.entryPhoto} alt="Giriş Görseli" className="h-40 max-w-xs object-contain rounded" />}
                                          </a>
                                          {/* Tarih + ekleyen ismi */}
                                          <div className="text-[10px] text-gray-500 border-t border-gray-100 pt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                             <span className="flex items-center gap-1"><Calendar size={11} /> {selectedRoomDetail.entryPhotoDate ? new Date(selectedRoomDetail.entryPhotoDate).toLocaleDateString('tr-TR') : (selectedRoomDetail.entryDate || '-')}</span>
                                             <span className="flex items-center gap-1"><UserCog size={11} /> Ekleyen: {selectedRoomDetail.entryPhotoBy || selectedRoomDetail.rentedBy || 'Bilinmiyor'}</span>
                                          </div>
                                          {/* Değiştir / Sil butonları — sadece düzenleme modunda görünür */}
                                          {isEditingEntryMedia && (
                                          <div className="flex gap-2 mt-1">
                                             <label className="flex-1 cursor-pointer flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-3 py-2 rounded-lg text-xs font-bold transition-colors">
                                                <RefreshCcw size={13} /> Değiştir
                                                <input type="file" accept="image/*,video/*" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const isVid = file.type.startsWith('video'); const url = await uploadImageToServer(file); await handleUpdateEntryMedia(url, isVid ? 'video' : 'image'); } e.target.value=''; }} />
                                             </label>
                                             <button onClick={() => { if(window.confirm('Giriş görselini silmek istediğinize emin misiniz?')) handleUpdateEntryMedia(null); }} className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 px-3 py-2 rounded-lg text-xs font-bold transition-colors"><Trash2 size={13} /> Sil</button>
                                          </div>
                                          )}
                                       </div>
                                   ) : (
                                       /* Görsel yoksa: sonradan yükleme alanı (her zaman açık) */
                                       <label className="cursor-pointer border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-lg p-6 bg-gray-50 hover:bg-indigo-50/30 flex flex-col items-center justify-center gap-2 text-center transition-colors w-max max-w-full">
                                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center"><Upload size={18} /></div>
                                          <span className="text-xs font-bold text-gray-600">Oda İlk Giriş Görseli / Videosu Ekle</span>
                                          <span className="text-[10px] text-gray-400">Fotoğraf veya video yükleyin — birden fazla seçebilirsiniz</span>
                                          <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => { await handleAppendEntryMediaFiles(e.target.files); e.target.value=''; }} />
                                       </label>
                                   )}

                                   {/* YENİ EKLENEN: EK GİRİŞ GÖRSELLERİ — çoklu seçimle eklenen dosyalar burada
                                       listelenir; her biri yeni sekmede açılır ve düzenleme modunda tek tek silinebilir. */}
                                   {Array.isArray(selectedRoomDetail?.entryPhotos) && selectedRoomDetail.entryPhotos.length > 0 && (
                                     <div className="mt-2">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ek Görseller ({selectedRoomDetail.entryPhotos.length} adet)</span>
                                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-1.5">
                                           {selectedRoomDetail.entryPhotos.map((m, idx) => (
                                             <div key={idx} className="relative border border-gray-200 rounded-lg overflow-hidden bg-white">
                                                <a href={m.url} target="_blank" rel="noreferrer" className="block">
                                                   {m.mediaType === 'video'
                                                      ? <video src={m.url} className="h-20 w-full object-cover bg-black" />
                                                      : <img src={m.url} alt={`Ek Görsel ${idx + 1}`} className="h-20 w-full object-cover hover:scale-105 transition-transform" />}
                                                </a>
                                                {m.mediaType === 'video' && <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">VİDEO</span>}
                                                {isEditingEntryMedia && (
                                                  <button onClick={() => { if(window.confirm('Bu ek görseli silmek istediğinize emin misiniz?')) handleRemoveEntryExtra(idx); }} className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow" title="Sil"><X size={11}/></button>
                                                )}
                                             </div>
                                           ))}
                                        </div>
                                        {/* Görsel varken de yeni ek dosya eklenebilsin */}
                                        <label className="mt-2 cursor-pointer inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors">
                                           <Plus size={12}/> Ek Görsel/Video Ekle (Çoklu)
                                           <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => { await handleAppendEntryMediaFiles(e.target.files); e.target.value=''; }} />
                                        </label>
                                     </div>
                                   )}
                                   {/* Ana görsel VAR ama ek görsel YOK ise de çoklu ekleme yolu açık kalsın */}
                                   {selectedRoomDetail?.entryPhoto && (!selectedRoomDetail?.entryPhotos || selectedRoomDetail.entryPhotos.length === 0) && (
                                     <label className="mt-1 cursor-pointer inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors w-max">
                                        <Plus size={12}/> Ek Görsel/Video Ekle (Çoklu)
                                        <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => { await handleAppendEntryMediaFiles(e.target.files); e.target.value=''; }} />
                                     </label>
                                   )}
                                </div>

                                {/* GİRİŞ - ÇIKIŞ ARŞİVİ BÖLÜMÜ */}
                                {selectedRoomDetail?.entryExitHistory && selectedRoomDetail.entryExitHistory.length > 0 && (
                                    <div className="flex flex-col gap-3 md:col-span-2 mt-2 pt-4 border-t border-gray-100">
                                       <h4 className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1"><History size={14} /> Giriş - Çıkış İşlem Arşivi</h4>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                           {selectedRoomDetail.entryExitHistory.map((item) => (
                                               <div key={item.id} className="border border-indigo-100 rounded-xl p-3 bg-indigo-50/30 flex flex-col gap-2 shadow-sm">
                                                   <div className="flex justify-between items-center border-b border-indigo-100 pb-2 mb-1">
                                                       <span className="text-xs font-bold text-gray-700">{item.date}</span>
                                                       <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Mühür: {item.sealNo}</span>
                                                   </div>
                                                   <div className="flex gap-2">
                                                       {item.protocolPhoto ? (
                                                           <div className="flex-1 flex flex-col gap-1">
                                                               <span className="text-[9px] text-gray-500 text-center font-medium">Tutanak</span>
                                                               <a href={item.protocolPhoto} target="_blank" rel="noreferrer" className="block border border-gray-200 rounded overflow-hidden bg-white">
                                                                   <img src={item.protocolPhoto} alt="Tutanak" className="h-16 w-full object-cover hover:scale-105 transition-transform" />
                                                               </a>
                                                           </div>
                                                       ) : (
                                                           <div className="flex-1 flex flex-col gap-1 justify-center items-center bg-white border border-gray-200 rounded h-16 opacity-50">
                                                               <span className="text-[9px] text-gray-400">Tutanak Yok</span>
                                                           </div>
                                                       )}
                                                       {item.finalPhoto ? (
                                                           <div className="flex-1 flex flex-col gap-1">
                                                               <span className="text-[9px] text-gray-500 text-center font-medium">Son Hal</span>
                                                               <a href={item.finalPhoto} target="_blank" rel="noreferrer" className="block border border-gray-200 rounded overflow-hidden bg-white">
                                                                   <img src={item.finalPhoto} alt="Son Hal" className="h-16 w-full object-cover hover:scale-105 transition-transform" />
                                                               </a>
                                                           </div>
                                                       ) : (
                                                           <div className="flex-1 flex flex-col gap-1 justify-center items-center bg-white border border-gray-200 rounded h-16 opacity-50">
                                                               <span className="text-[9px] text-gray-400">Görsel Yok</span>
                                                           </div>
                                                       )}
                                                   </div>
                                                   {/* YENİ: Tarih + ekleyen ismi (foto/video altında) */}
                                                   <div className="text-[9px] text-gray-500 border-t border-indigo-100 pt-1.5 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                                      <span className="flex items-center gap-1"><Calendar size={10} /> {item.date}</span>
                                                      <span className="flex items-center gap-1"><UserCog size={10} /> Ekleyen: {item.addedBy || 'Bilinmiyor'}</span>
                                                   </div>
                                               </div>
                                           ))}
                                       </div>
                                    </div>
                                )}
                              </div>
                           </div>

                           {/* YENİ: İki gruplu buton düzeni */}
                           <div className="mb-10 pb-8 border-b border-gray-100 flex flex-col gap-6">
                             {/* BLOK 1 - ODA İŞLEMLERİ */}
                             <div>
                               <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">Oda İşlemleri</h4>
                               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                 <button onClick={() => { if(!checkActionPerm('action-giris-cikis')) return; setIsEntryExitModalOpen(true); }} className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-700 font-bold text-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-sm shadow-indigo-500/30 group-hover:scale-110 transition-transform"><RefreshCcw size={18}/></div>
                                    <span className="text-center leading-tight">Oda Giriş-Çıkış İşlemi</span>
                                 </button>
                                 {/* Buton herkese GÖRÜNÜR; izni olan çıkış yapar, izni olmayan tıklayınca uyarı alır (yöneticinize danışın) */}
                                 <button onClick={() => { if(!checkActionPerm('action-depodan-cikis')) return; /* YENİ: Cari borç kontrolü — borcu olan müşteride oda çıkışı engellenir, uyarı ekranı açılır. */ const _exitCust = customers.find(c => c.name === (selectedRoomDetail?.customerName || '')); const _exitBalance = _exitCust ? Math.round(getCustomerLedger(_exitCust).balance || 0) : 0; if (_exitBalance > 0) { setExitDebtBlock({ customerId: _exitCust?.id || null, customerName: _exitCust?.name || selectedRoomDetail?.customerName || '', roomName: selectedRoomDetail?.name || '', balance: _exitBalance }); return; } setEndRentData({ exitDate: new Date().toISOString().split('T')[0], photo: null, carrierName: '', carrierVkn: '', carrierAuthorized: '', exitBy: '' }); setIsEndRentModalOpen(true); }} className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-red-50 hover:bg-red-100 border border-red-100 text-red-700 font-bold text-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                                    <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-sm shadow-red-500/30 group-hover:scale-110 transition-transform"><LogOut size={18}/></div>
                                    <span className="text-center leading-tight">Odadan Çıkış Yap</span>
                                 </button>
                                 <button onClick={() => { if(!checkActionPerm('action-oda-degistir')) return; setIsChangeRoomModalOpen(true); }} className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-orange-50 hover:bg-orange-100 border border-orange-100 text-orange-700 font-bold text-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm shadow-orange-500/30 group-hover:scale-110 transition-transform"><RefreshCcw size={18}/></div>
                                    <span className="text-center leading-tight">Oda Değiştir</span>
                                 </button>
                               </div>
                             </div>
                             {/* BLOK 2 - MÜŞTERİ İŞLEMLERİ (orta): Randevu Oluştur + Müşteri Bilgilendirme */}
                             <div>
                               <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">Müşteri İşlemleri</h4>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                 {/* Randevu Oluştur */}
                                 <button onClick={() => { if(!checkActionPerm('action-yeni-randevu')) return; setRoomAppointmentData({ date: new Date().toISOString().split('T')[0], time: '10:00 - 11:00', purpose: 'giris-cikis' }); setRoomAppointmentModal(true); }} className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 font-bold text-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm shadow-emerald-500/30 group-hover:scale-110 transition-transform"><Calendar size={18}/></div>
                                    <span className="text-center leading-tight">Randevu Oluştur</span>
                                 </button>
                                 {/* Müşteri Bilgilendirme (açılır menü) */}
                                 <div className="relative">
                                    <button onClick={() => { if(!checkActionPerm('action-musteri-bilgilendirme')) return; setIsTutanakDropdownOpen(!isTutanakDropdownOpen); }} className="group w-full h-full flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 font-bold text-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                                      <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-sm shadow-blue-500/30 group-hover:scale-110 transition-transform"><FileTextIcon size={18}/></div>
                                      <span className="text-center leading-tight flex items-center gap-1">Müşteri Bilgilendirme <ChevronDown size={12} className={`transition-transform ${isTutanakDropdownOpen ? 'rotate-180' : ''}`} /></span>
                                    </button>
                                    {isTutanakDropdownOpen && (
                                      <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsTutanakDropdownOpen(false)}></div>
                                         <div className="absolute left-0 right-0 sm:right-0 mt-2 w-full sm:w-80 bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-2">
                                           {[
                                             { label: '1- Müşteri Kendisi Eşya Alma', type: 'self' },
                                             { label: '2- Başka Nakliyeci ile Çıkış', type: 'exit' },
                                             { label: '3- Başka Nakliyeci ile Giriş', type: 'entry' }
                                           ].map((obj, idx) => (
                                              <button key={idx} onClick={() => { setIsTutanakDropdownOpen(false); setInfoNotifyModal(obj.type); }} className="w-full px-4 py-3 text-left text-xs font-bold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-gray-50 last:border-0 flex items-center gap-2">
                                                <MessageCircle size={14} className="text-blue-500 shrink-0"/> {obj.label}
                                              </button>
                                           ))}
                                        </div>
                                      </>
                                    )}
                                 </div>
                               </div>
                             </div>

                             {/* BLOK 3 - MUHASEBE İŞLEMLERİ (alt): Ücretsiz Oda + Hediye Ay Ver */}
                             <div>
                               <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">Muhasebe İşlemleri</h4>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                 {selectedRoomDetail?.isFreeRoom ? (
                                    <div className="flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-2xl bg-cyan-100 border border-cyan-200 text-cyan-700 font-bold text-xs">
                                       <div className="w-10 h-10 rounded-xl bg-cyan-500 text-white flex items-center justify-center shadow-sm"><Gift size={18}/></div>
                                       <span className="text-center leading-tight">Ücretsiz Oda</span>
                                       <button onClick={() => { if(!checkActionPerm('action-ucretsiz-oda')) return; handleRemoveFreeRoom(); }} className="text-[10px] text-cyan-600 hover:text-cyan-800 underline" title="Ücretsiz Odayi Kaldir">Kaldır</button>
                                    </div>
                                 ) : (
                                    <button onClick={() => { if(!checkActionPerm('action-ucretsiz-oda')) return; setFreeRoomReasonInput(''); setIsFreeRoomModalOpen(true); }} className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-100 text-cyan-700 font-bold text-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                                       <div className="w-10 h-10 rounded-xl bg-cyan-500 text-white flex items-center justify-center shadow-sm shadow-cyan-500/30 group-hover:scale-110 transition-transform"><Gift size={18}/></div>
                                       <span className="text-center leading-tight">Ücretsiz Oda</span>
                                    </button>
                                 )}
                                 {selectedRoomDetail?.giftMonths > 0 ? (
                                    <div className="flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-2xl bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs">
                                       <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-sm"><Gift size={18}/></div>
                                       <span className="text-center leading-tight">{selectedRoomDetail.giftMonths} Ay Hediye</span>
                                       <button onClick={() => { if(!checkActionPerm('action-hediye-ay')) return; handleSetGiftMonths(0); }} className="text-[10px] text-purple-500 hover:text-purple-800 underline" title="Hediyeyi Kaldır">Kaldır</button>
                                    </div>
                                 ) : (
                                    <button onClick={() => { if(!checkActionPerm('action-hediye-ay')) return; setGiftMonthValue(1); setGiftStartMonthKey(`${new Date().getFullYear()}-${new Date().getMonth()}`); setIsGiftModalOpen(true); }} className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-100 text-purple-700 font-bold text-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                                       <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-sm shadow-purple-500/30 group-hover:scale-110 transition-transform"><Gift size={18}/></div>
                                       <span className="text-center leading-tight">Hediye Ay Ver</span>
                                    </button>
                                 )}
                               </div>
                             </div>
                           </div>

                           {selectedRoomDetail?.isFreeRoom && (
                              <div className="mb-6 p-4 rounded-xl border flex items-start gap-3 shadow-sm bg-cyan-50 border-cyan-200 text-cyan-800">
                                  <div className="mt-0.5 bg-cyan-100 p-1.5 rounded-lg"><Gift size={18} className="text-cyan-600" /></div>
                                  <div>
                                     <h4 className="font-bold text-sm mb-1 text-cyan-900">Bu Oda Ücretsiz Olarak İşaretlendi</h4>
                                     <p className="text-xs font-medium opacity-90 leading-relaxed text-cyan-800">
                                       <strong>Neden:</strong> {selectedRoomDetail.freeRoomReason}
                                     </p>
                                  </div>
                               </div>
                           )}

                           <div className="mb-6 flex justify-between items-center">
                               <h3 className="text-xl font-bold text-slate-800">Aylık Kiralama Dökümü</h3>
                               <div className="flex flex-wrap items-center gap-2">
                                   <button onClick={() => { if(!checkActionPerm('action-gecmis-zam-duzenle')) return; setIsPastIncreaseModalOpen(true); }} className="text-xs bg-orange-50 text-orange-600 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-bold border border-orange-200 transition-colors flex items-center gap-1.5"><Edit size={14}/> Geçmiş Zamları Düzenle</button>
                                   {selectedRoomDetail?.priceHistory && selectedRoomDetail.priceHistory.length > 0 && (
                                       <button onClick={() => setIsPriceHistoryModalOpen(true)} className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-bold border border-indigo-200 transition-colors flex items-center gap-1.5"><TrendingUp size={14}/> Zam Geçmişi</button>
                                   )}
                                   <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">Giriş: {selectedRoomDetail?.entryDate || '01.01.2026'}</span>
                               </div>
                           </div>
                           
                           {(() => {
                               if (!selectedRoomDetail?.priceHistory || selectedRoomDetail.priceHistory.length === 0) return null;
                               const latestInc = selectedRoomDetail.priceHistory[selectedRoomDetail.priceHistory.length - 1];
                               return (
                                  <div className="mb-6 p-4 rounded-xl border flex items-start gap-3 shadow-sm bg-blue-50 border-blue-200 text-blue-800">
                                      <div className="mt-0.5 bg-blue-100 p-1.5 rounded-lg"><TrendingUp size={18} className="text-blue-600" /></div>
                                      <div>
                                         <h4 className="font-bold text-sm mb-1 text-blue-900">Kira Bedeli Güncellendi ({latestInc.anniversaryYear} Yılı)</h4>
                                         <p className="text-xs font-medium opacity-90 leading-relaxed text-blue-800">
                                           Bu odanın kira bedeli {latestInc.date} tarihinde <strong>%{latestInc.percentage}</strong> oranında zamlanarak <span className="line-through opacity-70">{latestInc.oldFee} TL</span>'den <strong>{latestInc.newFee} TL</strong>'ye yükseltilmiştir.
                                         </p>
                                      </div>
                                   </div>
                               );
                           })()}

                           <div className="flex justify-center items-center gap-4 mb-8 bg-white p-2 rounded-xl border border-gray-200 w-max mx-auto shadow-sm">
                              <span className="text-sm font-semibold text-gray-500 pl-2">Gösterilen Yıl:</span>
                              <button onClick={()=>setDetailYear(detailYear-1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors font-bold text-gray-500">&lt;</button>
                              <span className="text-lg font-bold w-16 text-center text-[#1bc5bd]">{detailYear}</span>
                              <button onClick={()=>setDetailYear(detailYear+1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors font-bold text-gray-500">&gt;</button>
                           </div>

                           <div className="flex flex-col gap-2.5 mb-10">
                              {currentPaymentsList.length > 0 ? currentPaymentsList.map((payment) => (
                                 <div key={payment.id} className={`flex items-center justify-between gap-3 px-4 py-3 border rounded-xl transition-all hover:shadow-sm ${payment.isGifted ? 'bg-purple-50 border-purple-200' : (payment.isFree ? 'bg-cyan-50 border-cyan-200' : 'bg-white border-gray-200')}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                       <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-bold text-sm ${payment.isGifted ? 'bg-purple-100 text-purple-600' : (payment.isFree ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-500')}`}>{payment.id + 1}</div>
                                       <div className="min-w-0">
                                          <h4 className="font-bold text-gray-800 text-[13px] leading-tight">{payment.title}</h4>
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                              <p className="text-[11px] text-gray-400 font-medium">{payment.payDay} {payment.month} {payment.year}</p>
                                              {payment.increaseInfo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">⬆ {payment.increaseInfo}</span>}
                                          </div>
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="flex flex-col items-end">
                                           <span className={`font-extrabold text-base ${payment.isGifted ? 'text-purple-600' : (payment.isFree ? 'text-cyan-600' : 'text-gray-800')}`}>{(Number(payment.amount) || 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL</span>
                                           <span className="text-[10px] text-gray-400 font-medium leading-tight">Net {Number(payment.baseAmount).toFixed(0)}{payment.hasKdv && ` + KDV ${Number(payment.kdvAmount).toFixed(0)}`}</span>
                                        </div>
                                        {!payment.isFree && (
                                            <button onClick={() => {
                                                if(!checkActionPerm('action-kira-dokum-duzenle')) return;
                                                setSpecificMonthEditData({
                                                    txId: payment.txId,
                                                    title: payment.title,
                                                    currentAmount: payment.amount,
                                                    newAmount: payment.amount,
                                                    date: payment.dateObj,
                                                    desc: `${selectedRoomDetail.name} Odası - Kira Düzenlemesi (${payment.month} ${payment.year})`
                                                });
                                                setIsEditSpecificMonthModalOpen(true);
                                            }} className="bg-orange-50 hover:bg-orange-100 text-orange-500 p-1.5 rounded-lg transition-colors" title="Bu ayın kirasını düzenle"><Edit size={14}/></button>
                                        )}
                                    </div>
                                 </div>
                              )) : (
                                 <div className="text-center py-10 text-gray-500 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3"><Calendar size={24} className="text-gray-300" /></div>
                                    <p className="font-medium text-sm">Seçilen yıl için henüz tahakkuk eden (gelmiş) bir kira bedeli bulunmamaktadır.</p>
                                 </div>
                              )}
                           </div>

                           <div className="bg-red-50 border-2 border-red-100 rounded-xl p-6 flex items-center justify-between">
                              <div><h4 className="text-red-800 font-bold text-lg">Müşteri Toplam Cari Bakiyesi</h4><p className="text-red-500 text-sm">Müşteriye ait tüm odaların ve ekstra hizmetlerin toplam güncel borcu.</p></div>
                              <div className="text-3xl font-extrabold text-red-600">{customerTotalBalance.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</div>
                           </div>
                        </>
                     )}
                  </div>
                </div>
            </div>
          ) : (activeMenu === 'depo' || activeMenu === 'sube-kontrol') ? (
            <Depo
              activeMenu={activeMenu} setActiveMenu={setActiveMenu}
              warehouses={warehouses} setWarehouses={setWarehouses}
              blocks={blocks} setBlocks={setBlocks}
              rooms={rooms} setRooms={setRooms}
              inspections={inspections} setInspections={setInspections}
              selectedWarehouseId={selectedWarehouseId} setSelectedWarehouseId={setSelectedWarehouseId}
              selectedBlockId={selectedBlockId} setSelectedBlockId={setSelectedBlockId}
              setSelectedRoomId={setSelectedRoomId}
              activeSizeFilter={activeSizeFilter} setActiveSizeFilter={setActiveSizeFilter}
              sizeFilterScope={sizeFilterScope} setSizeFilterScope={setSizeFilterScope}
              showReservedView={showReservedView} setShowReservedView={setShowReservedView}
              reservedViewScope={reservedViewScope} setReservedViewScope={setReservedViewScope}
              setRoomPhotoViewer={setRoomPhotoViewer}
              bulkM3Result={bulkM3Result}
              inspectionWarehouseId={inspectionWarehouseId} setInspectionWarehouseId={setInspectionWarehouseId}
              getWarehouseStats={getWarehouseStats} getWarehouseOccupiedM3={getWarehouseOccupiedM3} getWarehouseCapacityM3={getWarehouseCapacityM3}
              getRoomStats={getRoomStats} getBlockOccupiedM3={getBlockOccupiedM3} getBlockCapacityM3={getBlockCapacityM3}
              displayRoomM3={displayRoomM3} formatRoomDims={formatRoomDims} roundRoomM3={roundRoomM3}
              db={db} firebaseUser={firebaseUser} appId={appId}
              checkActionPerm={checkActionPerm} logActivity={logActivity} archiveDeletedItem={archiveDeletedItem} uploadImageToServer={uploadImageToServer}
              currentUserProfile={currentUserProfile} getCurrentRole={getCurrentRole}
            />
          ) : activeMenu === 'pdf-sozlesme' ? (
            <div className="max-w-5xl mx-auto pb-10">
              <div className="mb-6">
                <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Ayarlar</h1>
                <h2 className="text-2xl font-bold text-slate-800">PDF & Sözleşme Ayarları</h2>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200 bg-gray-50/50">
                  <button onClick={() => setActiveSettingsTab('iban')} className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeSettingsTab === 'iban' ? 'border-[#1bc5bd] text-[#1bc5bd] bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>IBAN / Banka Bilgileri</button>
                  <button onClick={() => setActiveSettingsTab('maddeler')} className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeSettingsTab === 'maddeler' ? 'border-[#1bc5bd] text-[#1bc5bd] bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Sözleşme Maddeleri</button>
                </div>

                <div className="p-6 md:p-8">
                  {activeSettingsTab === 'iban' && (
                    <div className="animate-in fade-in duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2 md:col-span-2">
                           <h3 className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-2 mb-2">PDF Ödeme Bilgisi - IBAN Hesabı</h3>
                        </div>
                        <div className="flex flex-col gap-1.5 md:col-span-2">
                          <label className="text-xs font-semibold text-gray-600">IBAN Numarası</label>
                          <input type="text" value={contractSettings.iban} onChange={(e) => setContractSettings({...contractSettings, iban: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" />
                        </div>
                        <div className="flex flex-col gap-1.5 md:col-span-2">
                          <label className="text-xs font-semibold text-gray-600">Hesap Sahibi (Sözleşme)</label>
                          <input type="text" value={contractSettings.accountHolder} onChange={(e) => setContractSettings({...contractSettings, accountHolder: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-gray-600">Banka Adı (PDF - Kısa)</label>
                          <input type="text" value={contractSettings.bankShortName} onChange={(e) => setContractSettings({...contractSettings, bankShortName: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-gray-600">Banka Adı Tam (Sözleşme)</label>
                          <input type="text" value={contractSettings.bankFullName} onChange={(e) => setContractSettings({...contractSettings, bankFullName: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" />
                        </div>
                        <div className="flex flex-col gap-1.5 md:col-span-2">
                          <label className="text-xs font-semibold text-gray-600">IBAN Uyarı Metni</label>
                          <textarea rows="2" value={contractSettings.ibanWarning} onChange={(e) => setContractSettings({...contractSettings, ibanWarning: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700 resize-none"></textarea>
                        </div>
                        <div className="md:col-span-2 flex justify-end mt-4">
                          <button onClick={handleSaveContractSettings} className="bg-[#1bc5bd] hover:bg-teal-500 text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors">Tüm Ayarları Kaydet</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'maddeler' && (
                    <div className="animate-in fade-in duration-300">
                      <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-6">
                        <h3 className="text-sm font-bold text-gray-700">Sözleşme Maddeleri (Düzenleyebilirsiniz)</h3>
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-semibold border border-blue-100">Dinamik Alanlar: {'{{MUSTERI_AD}}, {{MUSTERI_TC}}, {{MUSTERI_NUMARASI}}'} vb.</span>
                      </div>
                      
                      <div className="flex flex-col gap-6">
                         {contractSettings.clauses.map((clause) => (
                            <div key={clause.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                               <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 font-bold text-gray-700 text-sm flex items-center justify-between">
                                  {clause.title}
                                  
                                  {/* Fake Editor Toolbar for Visual Fidelity */}
                                  <div className="hidden sm:flex items-center gap-1 opacity-50">
                                      <span className="w-5 h-5 flex items-center justify-center bg-white rounded border border-gray-300 text-[10px] font-bold">B</span>
                                      <span className="w-5 h-5 flex items-center justify-center bg-white rounded border border-gray-300 text-[10px] italic">I</span>
                                      <span className="w-5 h-5 flex items-center justify-center bg-white rounded border border-gray-300 text-[10px] underline">U</span>
                                  </div>
                               </div>
                               <textarea 
                                  rows={clause.id === 'm1' ? 12 : clause.id === 'm6' ? 14 : 6} 
                                  value={clause.content} 
                                  onChange={(e) => handleClauseContentChange(clause.id, e.target.value)} 
                                  className="w-full p-4 text-sm font-medium text-gray-700 bg-white focus:outline-none focus:bg-yellow-50/20 resize-y"
                               ></textarea>
                            </div>
                         ))}
                      </div>

                      <div className="flex justify-end mt-8">
                         <button onClick={handleSaveContractSettings} className="bg-[#1bc5bd] hover:bg-teal-500 text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors">Değişiklikleri Kaydet</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeMenu === 'islem-hareketleri' ? (
            <div className="max-w-5xl mx-auto pb-10 animate-in fade-in duration-300">
              <div className="mb-6">
                <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Sistem Ayarları</h1>
                <h2 className="text-2xl font-bold text-slate-800">İşlem Hareketleri</h2>
                <p className="text-sm text-gray-500 mt-1">Tüm kullanıcıların yaptığı işlemleri (kayıt, silme, değişiklik, taşıma, tahsilat vb.) buradan takip edin.</p>
              </div>

              {/* YENİ: Yenile — kayıtları tek seferlik yeniden çeker (arka planda sürekli dinleme yok) */}
              <div className="flex justify-end mb-3">
                <button onClick={fetchActivityLogs} className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors"><RefreshCcw size={14}/> Yenile</button>
              </div>

              {/* Filtreler */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3">
                 <div className="flex-1">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Kullanıcıya Göre</label>
                    <select value={logUserFilter} onChange={(e) => setLogUserFilter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:border-indigo-400 bg-white">
                        <option value="all">Tüm Kullanıcılar</option>
                        {[...new Set(activityLogs.map(l => l.userName))].filter(Boolean).map(u => (<option key={u} value={u}>{u}</option>))}
                    </select>
                 </div>
                 <div className="flex-1">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Zamana Göre</label>
                    <select value={logTimeFilter} onChange={(e) => setLogTimeFilter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:border-indigo-400 bg-white">
                        <option value="today">Bugün</option>
                        <option value="week">Bu Hafta</option>
                        <option value="month">Bu Ay</option>
                        <option value="year">Bu Sene</option>
                        <option value="all">Tüm Zamanlar</option>
                    </select>
                 </div>
              </div>

              {/* Liste */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                 {(() => {
                    let list = [...activityLogs];
                    if (logUserFilter !== 'all') list = list.filter(l => l.userName === logUserFilter);
                    if (logTimeFilter !== 'all') list = list.filter(l => inDashboardRange(l.dateISO ? new Date(l.dateISO) : null, logTimeFilter));
                    list.sort((a, b) => new Date(b.dateISO || 0) - new Date(a.dateISO || 0));

                    if (list.length === 0) return (
                        <div className="text-center py-16">
                           <div className="w-16 h-16 bg-gray-100 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-3"><RefreshCcw size={28}/></div>
                           <h3 className="text-lg font-bold text-gray-600 mb-1">Kayıt Bulunamadı</h3>
                           <p className="text-sm text-gray-400">Seçili filtrelerde işlem hareketi bulunmuyor.</p>
                        </div>
                    );

                    const typeColor = (t) => {
                        const s = String(t).toLocaleLowerCase('tr-TR');
                        if (s.includes('sil')) return 'bg-red-100 text-red-600';
                        if (s.includes('ekle') || s.includes('kayıt') || s.includes('kayit')) return 'bg-emerald-100 text-emerald-600';
                        if (s.includes('taşı') || s.includes('tasi') || s.includes('değiş') || s.includes('degis') || s.includes('düzenle') || s.includes('duzenle')) return 'bg-amber-100 text-amber-600';
                        if (s.includes('tahsilat') || s.includes('ödeme') || s.includes('odeme')) return 'bg-blue-100 text-blue-600';
                        return 'bg-indigo-100 text-indigo-600';
                    };

                    return (
                        <div className="divide-y divide-gray-100">
                            {list.map(log => {
                                const d = log.dateISO ? new Date(log.dateISO) : null;
                                const dateStr = d ? d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                                return (
                                    <div key={log.id} className="flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center font-bold shrink-0 text-sm">{(log.userName || '?').charAt(0)}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-slate-800 text-sm">{log.userName}</span>
                                                {log.userRole && <span className="text-[10px] font-bold text-gray-400 uppercase">{log.userRole}</span>}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeColor(log.type)}`}>{log.type}</span>
                                            </div>
                                            <p className="text-sm text-gray-600 mt-0.5 break-words">{log.description}</p>
                                        </div>
                                        <div className="text-[11px] font-semibold text-gray-400 whitespace-nowrap shrink-0">{dateStr}</div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                 })()}
              </div>
            </div>
          ) : activeMenu === 'islem-geri-yukle' ? (
            <div className="max-w-5xl mx-auto pb-10 animate-in fade-in duration-300">
              <div className="mb-6">
                <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Sistem Ayarları</h1>
                <h2 className="text-2xl font-bold text-slate-800">İşlem Geri Yükle</h2>
                <p className="text-sm text-gray-500 mt-1">Sistemden silinen müşteri, oda, şube, blok ve diğer kayıtları buradan geri getirebilirsiniz. Her kaydın kim tarafından ve ne zaman silindiği gösterilir.</p>
              </div>
              {/* YENİ: Yenile — silinen kayıtları tek seferlik yeniden çeker (arka planda sürekli dinleme yok) */}
              <div className="flex justify-end mb-3">
                <button onClick={fetchDeletedItems} className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors"><RefreshCcw size={14}/> Yenile</button>
              </div>
              {(() => {
                  // Zaman filtresine göre süz + en yeni silinen en üstte
                  const filtered = deletedItems
                      .filter(d => !d.restored)
                      .filter(d => restoreRange === 'all' ? true : inDashboardRange(parseAnyDate(d.deletedAtISO), restoreRange))
                      .sort((a, b) => new Date(b.deletedAtISO) - new Date(a.deletedAtISO));
                  const typeColors = { 'Müşteri': 'bg-rose-50 text-rose-600 border-rose-200', 'Oda': 'bg-teal-50 text-teal-600 border-teal-200', 'Şube/Depo': 'bg-indigo-50 text-indigo-600 border-indigo-200', 'Blok': 'bg-amber-50 text-amber-600 border-amber-200' };
                  return (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                      {/* Zaman filtresi */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-gray-100 pb-4">
                          <div className="flex items-center gap-2"><RefreshCcw size={18} className="text-[#1bc5bd]"/><span className="text-sm font-bold text-gray-700">Silinen Kayıtlar ({filtered.length})</span></div>
                          <div className="flex flex-wrap gap-1.5">
                              {[['today','Bugün'],['week','Bu Hafta'],['month','Bu Ay'],['year','Bu Sene'],['all','Tümü']].map(([val,label]) => (
                                  <button key={val} onClick={() => setRestoreRange(val)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm ${restoreRange === val ? 'bg-[#1bc5bd] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>{label}</button>
                              ))}
                          </div>
                      </div>
                      {filtered.length === 0 ? (
                          <div className="text-center py-12 text-sm text-gray-400 font-medium">
                              <Trash2 size={28} className="mx-auto mb-2 text-gray-300"/>
                              Seçili dönemde geri yüklenebilecek silinmiş kayıt bulunmuyor.
                              <p className="text-[11px] text-gray-400 mt-2 max-w-md mx-auto">Not: Yalnızca bu özellik eklendikten sonra silinen kayıtlar burada görünür. Daha önce silinmiş kayıtlar geri getirilemez.</p>
                          </div>
                      ) : (
                          <div className="overflow-x-auto border border-gray-100 rounded-xl">
                              <table className="w-full text-left text-sm min-w-[640px]">
                                  <thead className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase text-gray-500 font-bold">
                                      <tr>
                                          <th className="px-3 py-2.5">Tür</th>
                                          <th className="px-3 py-2.5">Kayıt</th>
                                          <th className="px-3 py-2.5">Silen Kişi</th>
                                          <th className="px-3 py-2.5">Silinme Tarihi</th>
                                          <th className="px-3 py-2.5 text-center">İşlem</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                      {filtered.map((d) => (
                                          <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                                              <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeColors[d.entityType] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>{d.entityType}</span></td>
                                              <td className="px-3 py-2.5 font-bold text-gray-700">{d.label}</td>
                                              <td className="px-3 py-2.5 text-gray-600"><span className="flex items-center gap-1"><UserCog size={12}/> {d.deletedBy}{d.deletedByRole ? ` (${d.deletedByRole})` : ''}</span></td>
                                              <td className="px-3 py-2.5 text-gray-500 text-xs">{d.deletedAtISO ? new Date(d.deletedAtISO).toLocaleString('tr-TR') : '-'}</td>
                                              <td className="px-3 py-2.5 text-center">
                                                  <button onClick={() => { if (window.confirm(`"${d.label}" kaydını geri yüklemek istediğinize emin misiniz?`)) handleRestoreDeletedItem(d); }} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 mx-auto"><RefreshCcw size={12}/> Geri Yükle</button>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      )}
                    </div>
                  );
              })()}
            </div>
          ) : activeMenu === 'sistem-yedekleme' ? (
            <div className="max-w-5xl mx-auto pb-10 animate-in fade-in duration-300">
              <div className="mb-6">
                <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Sistem Ayarları</h1>
                <h2 className="text-2xl font-bold text-slate-800">Sistem Yedekleme</h2>
                <p className="text-sm text-gray-500 mt-1">Tüm veritabanını JSON olarak indirin veya geri yükleyin.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                    <Download size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Yedek İndir</h3>
                  <p className="text-sm text-gray-500 mb-6">Müşteriler, odalar, bloklar ve tüm sistem ayarlarını bilgisayarınıza JSON dosyası olarak indirin.</p>
                  <button onClick={handleExportJSON} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30">
                    <Download size={18} /> JSON Olarak İndir
                  </button>
                </div>

                <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <Upload size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Yedek Yükle</h3>
                  <p className="text-sm text-gray-500 mb-6">Daha önce aldığınız bir JSON yedeğini sisteme yükleyerek verileri geri getirin.</p>
                  <label className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 cursor-pointer">
                    <Upload size={18} /> JSON Dosyası Seç
                    <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
                  </label>
                </div>
              </div>
            </div>
          ) : (activeMenu === 'finans-rapor' || activeMenu === 'depo-rapor' || activeMenu === 'personel-rapor') ? (
            <Finans
              activeMenu={activeMenu} setActiveMenu={setActiveMenu}
              setSelectedCustomerId={setSelectedCustomerId}
              customers={customers} rooms={rooms} warehouses={warehouses} blocks={blocks}
              pendingCollections={pendingCollections} systemUsers={systemUsers}
              getCustomerLedger={getCustomerLedger}
              getRoomFeeForMonth={getRoomFeeForMonth} getRoomLatestFee={getRoomLatestFee}
              getWarehouseStats={getWarehouseStats} getWarehouseOccupiedM3={getWarehouseOccupiedM3} getWarehouseCapacityM3={getWarehouseCapacityM3}
              collectionRates={collectionRates}
              inDashboardRange={inDashboardRange} parseAnyDate={parseAnyDate} parseDateLocal={parseDateLocal}
            />
          ) : activeMenu === 'panel-kullanicilari' ? (
             <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
               <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                 <div>
                   <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Sistem Hesapları</h1>
                   <h2 className="text-2xl font-bold text-slate-800">Panel Kullanıcıları</h2>
                   <p className="text-sm text-gray-500 mt-1">Sisteme giriş yapabilecek yetkili personelleri ve yöneticileri buradan yönetebilirsiniz.</p>
                 </div>
                 <button onClick={() => setIsAddUserModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md shadow-indigo-500/20 flex items-center gap-2 transition-colors">
                     <Plus size={16} /> Yeni Kullanıcı Ekle
                 </button>
               </div>

               <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                  <div className="overflow-x-auto flex-1">
                      <table className="w-full text-left text-sm text-gray-600 min-w-[800px]">
                          <thead className="bg-slate-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold sticky top-0">
                              <tr>
                                  <th className="px-6 py-4">Kullanıcı Bilgileri</th>
                                  <th className="px-6 py-4">Giriş Bilgileri</th>
                                  <th className="px-6 py-4">İletişim</th>
                                  <th className="px-6 py-4 text-center">Rol / Yetki</th>
                                  <th className="px-6 py-4 text-center w-32">İşlem</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {systemUsers.map((user) => (
                                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-3">
                                              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0 overflow-hidden">
                                                  {user.avatar ? <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover"/> : user.name.charAt(0)}
                                              </div>
                                              <div>
                                                  <div className="font-bold text-gray-800 text-[15px]">{user.name}</div>
                                                  {user.id === currentUserProfile.id && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 mt-0.5 inline-block">Şu Anki Hesap</span>}
                                              </div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="font-medium text-gray-700 flex items-center gap-1.5"><UserCog size={14} className="text-gray-400"/> {user.username}</div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="text-xs text-gray-600 font-medium flex items-center gap-1.5 mb-1"><Phone size={12} className="text-gray-400"/> {user.phone || '-'}</div>
                                          <div className="text-xs text-gray-600 font-medium flex items-center gap-1.5"><MessageCircle size={12} className="text-gray-400"/> {user.email || '-'}</div>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <span className={`px-3 py-1 rounded-lg text-xs font-bold border shadow-sm ${user.role === 'Yönetici' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                              {user.role}
                                          </span>
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                          <div className="flex items-center justify-center gap-2">
                                              <button onClick={() => { setEditUserData({...user}); setIsEditUserModalOpen(true); }} className="bg-blue-50 hover:bg-blue-100 text-blue-600 p-2 rounded-lg transition-colors" title="Kullanıcıyı Düzenle">
                                                  <Edit size={16}/>
                                              </button>
                                              <button onClick={() => setUserToDeleteId(user.id)} disabled={user.id === currentUserProfile.id || systemUsers.length === 1} className="bg-red-50 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed text-red-600 p-2 rounded-lg transition-colors" title="Kullanıcıyı Sil">
                                                  <Trash2 size={16}/>
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
               </div>
             </div>
          ) : activeMenu === 'kullanici-hareketleri' ? (
             <div className="max-w-5xl mx-auto flex flex-col animate-in fade-in duration-300 pb-10">
               <div className="mb-6">
                 <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Sistem Hesapları</h1>
                 <h2 className="text-2xl font-bold text-slate-800">Kullanıcı Hareketleri</h2>
                 <p className="text-sm text-gray-500 mt-1">Kullanıcıların ne zaman giriş/çıkış yaptığını ve kimlerin çevrimiçi olduğunu buradan takip edin.</p>
               </div>

               {/* YENİ: Yenile — oturum kayıtlarını tek seferlik yeniden çeker (arka planda sürekli dinleme yok) */}
               <div className="flex justify-end mb-3">
                 <button onClick={fetchUserSessions} className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-3 py-2 rounded-lg text-xs font-bold transition-colors"><RefreshCcw size={14}/> Yenile</button>
               </div>

               {/* Şu an çevrimiçi olanlar özeti */}
               {(() => {
                  const onlineList = userSessions.filter(s => s.online);
                  return (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-5 flex items-center gap-3">
                       <div className="relative">
                          <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                          <div className="absolute inset-0 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></div>
                       </div>
                       <span className="text-sm font-bold text-emerald-800">Şu an çevrimiçi: {onlineList.length} kullanıcı</span>
                       {onlineList.length > 0 && <span className="text-xs text-emerald-600 font-medium">({[...new Set(onlineList.map(s => s.userName))].join(', ')})</span>}
                    </div>
                  );
               })()}

               {/* YENİ: Zaman + kullanıcı filtreleri */}
               <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex items-center gap-1.5 flex-1">
                     <Calendar size={15} className="text-indigo-400 shrink-0"/>
                     <select value={sessionTimeFilter} onChange={(e) => setSessionTimeFilter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-indigo-400 cursor-pointer">
                        <option value="all">Tüm Zamanlar</option>
                        <option value="today">Bugün</option>
                        <option value="7days">Son 7 Gün</option>
                        <option value="30days">Son 30 Gün</option>
                     </select>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1">
                     <UserCog size={15} className="text-indigo-400 shrink-0"/>
                     <select value={sessionUserFilter} onChange={(e) => setSessionUserFilter(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-indigo-400 cursor-pointer">
                        <option value="">Tüm Kullanıcılar</option>
                        {[...new Set(userSessions.map(s => s.userName))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr')).map(u => <option key={u} value={u}>{u}</option>)}
                     </select>
                  </div>
                  {(sessionTimeFilter !== 'all' || sessionUserFilter) && (
                     <button onClick={() => { setSessionTimeFilter('all'); setSessionUserFilter(''); }} className="flex items-center justify-center gap-1 text-xs font-bold text-gray-400 hover:text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors shrink-0"><X size={13}/> Temizle</button>
                  )}
               </div>

               {/* Oturum listesi */}
               <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {(() => {
                     // YENİ: kullanıcı + zaman filtresi uygulanır (giriş zamanına göre)
                     let list = [...userSessions];
                     if (sessionUserFilter) list = list.filter(s => s.userName === sessionUserFilter);
                     if (sessionTimeFilter !== 'all') {
                        const now = new Date();
                        let start = null;
                        if (sessionTimeFilter === 'today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        else if (sessionTimeFilter === '7days') start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        else if (sessionTimeFilter === '30days') start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        if (start) list = list.filter(s => s.loginISO && new Date(s.loginISO) >= start);
                     }
                     list = list.sort((a, b) => new Date(b.loginISO || 0) - new Date(a.loginISO || 0));
                     const filtreAktif = sessionTimeFilter !== 'all' || !!sessionUserFilter;
                     if (list.length === 0) return (
                         <div className="text-center py-16">
                            <div className="w-16 h-16 bg-gray-100 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-3"><UserCog size={28}/></div>
                            <h3 className="text-lg font-bold text-gray-600 mb-1">{filtreAktif ? 'Sonuç Bulunamadı' : 'Henüz Kayıt Yok'}</h3>
                            <p className="text-sm text-gray-400">{filtreAktif ? 'Seçtiğiniz filtrelere uygun bir hareket kaydı yok. Filtreleri değiştirmeyi deneyin.' : 'Kullanıcılar giriş yaptıkça hareketleri burada listelenecek.'}</p>
                         </div>
                     );
                     const fmt = (iso) => iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                     const sureHesapla = (a, b) => {
                        if (!a) return '';
                        const end = b ? new Date(b) : new Date();
                        const dk = Math.max(0, Math.round((end - new Date(a)) / 60000));
                        if (dk < 60) return `${dk} dk`;
                        const sa = Math.floor(dk / 60); const kdk = dk % 60;
                        return `${sa} sa ${kdk} dk`;
                     };
                     return (
                         <div className="divide-y divide-gray-100">
                             {list.map(s => (
                                 <div key={s.id} className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors">
                                     <div className="relative w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center font-bold shrink-0 text-sm">
                                        {(s.userName || '?').charAt(0)}
                                        {s.online && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>}
                                     </div>
                                     <div className="flex-1 min-w-0">
                                         <div className="flex flex-wrap items-center gap-2">
                                             <span className="font-bold text-slate-800 text-sm">{s.userName}</span>
                                             {s.userRole && <span className="text-[10px] font-bold text-gray-400 uppercase">{s.userRole}</span>}
                                             {s.online
                                                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">● Çevrimiçi</span>
                                                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Çevrimdışı</span>}
                                         </div>
                                         <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[11px] text-gray-500 font-medium">
                                            <span className="flex items-center gap-1"><LogIn size={11} className="text-emerald-500"/> Giriş: {fmt(s.loginISO)}</span>
                                            <span className="flex items-center gap-1"><LogOut size={11} className="text-red-400"/> Çıkış: {s.online ? 'Devam ediyor' : fmt(s.logoutISO)}</span>
                                            <span className="flex items-center gap-1"><Clock size={11} className="text-gray-400"/> Süre: {sureHesapla(s.loginISO, s.logoutISO)}</span>
                                         </div>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     );
                  })()}
               </div>
             </div>
          ) : activeMenu === 'kullanici-rolleri' ? (
             <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
               <div className="mb-6">
                   <h2 className="text-2xl font-bold text-slate-800">Kullanıcı rolleri</h2>
               </div>

               {/* YENİ ROL EKLEME KUTUSU */}
               <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                   <h3 className="text-lg font-bold text-gray-800 mb-2">Yeni Rol</h3>
                   <p className="text-[11px] text-gray-400 mb-6 font-medium">Yeni bir rol oluşturun. Oluşturduktan sonra aşağıdaki listeden istediğiniz yetki (izin) kutucuklarını işaretleyebilirsiniz.</p>
                   
                   <div className="flex flex-col md:flex-row items-end gap-6 max-w-2xl">
                       <div className="flex-1 w-full">
                           <label className="text-[11px] font-bold text-gray-500 mb-1.5 block">Rol Adı</label>
                           <input type="text" placeholder="Örn. Şube Müdürü" value={newRoleInput.name} onChange={(e) => setNewRoleInput({...newRoleInput, name: e.target.value})} className="w-full border border-gray-200 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                       </div>
                       <div className="w-full md:w-auto shrink-0">
                           <button onClick={handleAddRole} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 justify-center"><Plus size={16}/> Rol Ekle</button>
                       </div>
                   </div>
               </div>

               {/* ROLLERİN LİSTESİ VE İZİNLER */}
               <div className="mb-4">
                   <h3 className="text-xl font-bold text-gray-800 mb-2">Rollere göre menü ve işlem izinleri</h3>
                   <p className="text-[11px] text-gray-400 font-medium">İzinler; <span className="text-indigo-500 font-bold">Ana Menüler</span>, <span className="text-teal-500 font-bold">Sayfalar (Alt Menüler)</span> ve <span className="text-orange-500 font-bold">Kayıt İşlemleri</span> olmak üzere 3 ana gruba ayrılmıştır. Kutucukları işaretleyerek ilgili role erişim yetkisi verebilirsiniz. Süper (Yönetici) rol bu listede düzenlenmez.</p>
               </div>

               <div className="flex flex-col gap-6 pb-10 mt-4">
                   {userRoles.filter(r => !r.isSuper).map(role => (
                       <div key={role.id} className="bg-white shadow-sm border border-gray-200 p-6 rounded-lg relative">
                           <div className="flex justify-between items-center mb-6">
                               <div className="flex items-baseline gap-2">
                                   <h4 className="text-[15px] font-extrabold text-gray-800">{role.name}</h4>
                                   <span className="text-xs font-bold text-pink-500 lowercase tracking-wide">{role.code}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                   <button onClick={() => handleDeleteRole(role.id)} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"><Trash2 size={14}/> Rolü Sil</button>
                                   <button onClick={() => handleSaveRolePermissions(role.id)} className="bg-[#1bc5bd] hover:bg-teal-500 text-white px-4 py-1.5 rounded text-xs font-bold transition-colors shadow-sm">İzinleri kaydet</button>
                               </div>
                           </div>

                           <div className="mb-8">
                               <h5 className="text-[11px] font-bold text-gray-800 mb-4">Ana Menü İzinleri (Sol Panel)</h5>
                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
                                   {availablePermissions.mainMenus.map(perm => (
                                       <label key={perm.id} className="flex items-center gap-2 cursor-pointer group">
                                           <div className="relative flex items-center">
                                               <input 
                                                  type="checkbox" 
                                                  checked={role.permissions.mainMenus?.includes(perm.id)} 
                                                  onChange={() => handleTogglePermission(role.id, 'mainMenus', perm.id)}
                                                  className="peer shrink-0 w-4 h-4 text-indigo-500 border-gray-300 rounded focus:ring-indigo-500 focus:ring-offset-0 transition-colors" 
                                               />
                                           </div>
                                           <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-900 leading-none">{perm.label}</span>
                                       </label>
                                   ))}
                               </div>
                           </div>

                           <div className="border-t border-gray-100 pt-6 mb-8">
                               <h5 className="text-[11px] font-bold text-gray-800 mb-4">Sayfalar / Alt Menü İzinleri</h5>
                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
                                   {availablePermissions.pages.map(perm => (
                                       <label key={perm.id} className="flex items-center gap-2 cursor-pointer group">
                                           <div className="relative flex items-center">
                                               <input 
                                                  type="checkbox" 
                                                  checked={role.permissions.pages?.includes(perm.id)} 
                                                  onChange={() => handleTogglePermission(role.id, 'pages', perm.id)}
                                                  className="peer shrink-0 w-4 h-4 text-teal-500 border-gray-300 rounded focus:ring-teal-500 focus:ring-offset-0 transition-colors" 
                                               />
                                           </div>
                                           <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-900 leading-none">{perm.label}</span>
                                       </label>
                                   ))}
                               </div>
                           </div>

                           <div className="border-t border-gray-100 pt-6">
                               <h5 className="text-[11px] font-bold text-gray-800 mb-4">Kayıt ve İşlem İzinleri (CRUD)</h5>
                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
                                   {availablePermissions.actions.map(perm => (
                                       <label key={perm.id} className="flex items-center gap-2 cursor-pointer group">
                                           <div className="relative flex items-center">
                                               <input 
                                                  type="checkbox" 
                                                  checked={role.permissions.actions?.includes(perm.id)} 
                                                  onChange={() => handleTogglePermission(role.id, 'actions', perm.id)}
                                                  className="peer shrink-0 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 focus:ring-offset-0 transition-colors" 
                                               />
                                           </div>
                                           <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-900 leading-none">{perm.label}</span>
                                       </label>
                                   ))}
                               </div>
                           </div>
                       </div>
                   ))}
               </div>
             </div>
          ) : (
             <div className="flex items-center justify-center h-full text-center"><div><h2 className="text-xl font-medium text-gray-600 mb-2">Modül Hazırlanıyor</h2><p className="text-gray-400">Bu alan henüz geliştirilmemiştir.</p></div></div>
          )}
          </>
          )}
        </main>
      </div>

      {/* TÜM MODALLAR */}
      
      {/* SÖZLEŞME ÖNİZLEME VE İNDİR MODALI */}
      {isContractModalOpen && contractCustomer && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 lg:p-8">
          <div className="bg-gray-100 rounded-2xl shadow-2xl w-full max-w-4xl h-[95vh] flex flex-col animate-in fade-in zoom-in duration-200">
             
             {/* Modal Header */}
             <div className="flex items-center justify-between p-5 border-b border-gray-300 bg-white rounded-t-2xl shrink-0 shadow-sm z-10">
                 <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <FileTextIcon size={20} className="text-indigo-600" /> 
                    {contractCustomer.name} - Sözleşme Önizleme
                 </h3>
                 <div className="flex items-center gap-3">
                    <button onClick={handlePrintContract} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 shadow-sm">
                       <Download size={16} /> PDF Olarak İndir (Yazdır)
                    </button>
                    <button onClick={() => setIsContractModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-gray-100 hover:bg-gray-200 p-2 rounded-lg"><X size={20} /></button>
                 </div>
             </div>

{/* Modal Body - Printable Area Wrapper */}
             <div className="p-6 overflow-y-auto flex-1 flex justify-center items-start bg-gray-200">
                {/* Kağıt Simülasyonu (Ekranda Düzgün Görünmesi İçin Tablo Yerine Flex Akışı) */}
                <div id="printable-contract" className="bg-white shadow-md text-black relative flex flex-col justify-between" style={{ width: '100%', maxWidth: '210mm', minHeight: '297mm', height: 'max-content', padding: '40px 40px 60px 40px', fontFamily: 'Arial, sans-serif' }}>
                    
                    {/* Filigran (Watermark) */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 text-[40pt] md:text-[80pt] font-bold text-black opacity-5 pointer-events-none z-0 whitespace-nowrap">Depoevim</div>
                    
{/* İçerik Kısmı */}
                        <div className="relative z-10">
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ textAlign: 'center', fontSize: '15pt', fontWeight: 'bold', marginBottom: '20px', color: '#111' }}>Eşya Depolama Sözleşmesi</div>
                            
                            {contractSettings.clauses.map(clause => (
                                <div key={clause.id} style={{ marginBottom: '16px' }}>
                                    <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: '#111', margin: '0 0 5px 0' }}>{clause.title}</h3>
                                    {renderClauseWithData(clause.content).split('\n').map((line, idx) => {
                                        const trimmed = line.trim();
                                        if (!trimmed) return <br key={idx} />;
                                        const colonIdx = trimmed.indexOf(':');
                                        if (colonIdx > 0 && colonIdx < 60 && trimmed.substring(0, colonIdx).split(' ').length <= 8) {
                                            return <p key={idx} style={{ margin: '0 0 3px 0', textAlign: 'justify', color: '#333', fontSize: '10pt', lineHeight: '1.55' }}><strong>{trimmed.substring(0, colonIdx)}:</strong> {trimmed.substring(colonIdx + 1)}</p>;
                                        }
                                        return <p key={idx} style={{ margin: '0 0 3px 0', textAlign: 'justify', color: '#333', fontSize: '10pt', lineHeight: '1.55' }}>{trimmed}</p>;
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer Kısmı (Ekranda sadece en altta görünür) */}
                    <div className="relative z-10 mt-auto pt-6 border-t border-gray-300">
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none', fontSize: '9pt' }}>
                            <tbody>
                                <tr>
                                    <td style={{ width: '33%', verticalAlign: 'bottom', padding: 0, border: 'none' }}>
                                        <div style={{ lineHeight: '1.7' }}>
                                            <div style={{ fontWeight: 'bold' }}>HİZMET VEREN</div>
                                            <div><strong>Ad Soyad / Ünvan:</strong> {contractSettings.accountHolder}</div>
                                            <div><strong>İmza Yetkili Kişi Ad Soyad:</strong></div>
                                            <div><strong>İmza:</strong></div>
                                            <div style={{ marginTop: '6px' }}>
                                                <img src="https://www.sembolevdeneve.com/crm/uploads/ka%C5%9Fe.jpg" style={{ width: '110px', mixBlendMode: 'multiply', opacity: 0.95 }} alt="Kaşe" />
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ width: '34%', verticalAlign: 'bottom', textAlign: 'center', paddingBottom: '4px', border: 'none' }}>
                                        <img src="https://www.depoevim.com/wp-content/uploads/2025/07/cropped-logo.webp" alt="Depoevim" style={{ height: '40px', objectFit: 'contain' }} />
                                    </td>
                                    <td style={{ width: '33%', verticalAlign: 'bottom', padding: 0, border: 'none' }}>
                                        <div style={{ lineHeight: '1.7' }}>
                                            <div style={{ fontWeight: 'bold' }}>DEPOLATAN KİŞİ</div>
                                            <div><strong>Ad Soyad / Ünvan:</strong> {contractCustomer?.name}</div>
                                            <div><strong>İmza Yetkili Kişi Ad Soyad:</strong></div>
                                            <div><strong>İmza:</strong></div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                </div>
             </div>
          </div>
        </div>
      )}

      {isRentRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 lg:p-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto relative animate-in fade-in zoom-in duration-200">
             <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-slate-50 rounded-t-2xl sticky top-0 z-10"><h3 className="text-xl font-bold text-[#1bc5bd] flex items-center gap-2"><Key size={22} /> {selectedRoomDetail?.name} Numaralı Odayı Kirala</h3><button onClick={() => setIsRentRoomModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white p-1.5 rounded-full shadow-sm border border-gray-200"><X size={20} /></button></div>
             <div className="p-6 md:p-8">
               <div className="mb-8">
                 <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-full bg-[#1bc5bd] text-white flex items-center justify-center text-xs font-bold">1</div><h4 className="font-bold text-gray-800">Müşteri Seçimi</h4>
                    {/* YENİ: Hızlı müşteri ekleme — sayfaya gitmeden ortada modal açar, kaydedince otomatik seçer */}
                    <button type="button" onClick={() => setIsQuickCustomerModalOpen(true)} className="ml-auto flex items-center gap-1 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow-md shadow-teal-500/30 hover:scale-105 transition-all whitespace-nowrap"><Plus size={13} strokeWidth={3}/> Yeni Müşteri</button>
                 </div>
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                   <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Sistemdeki Müşteriler (Zorunlu)</label>
                   <input type="text" placeholder="Müşteri Adı veya No ile Ara..." value={rentCustomerSearch} onChange={(e) => setRentCustomerSearch(e.target.value)} className="w-full mb-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700 bg-white" />
<select value={rentData.customerName} onChange={(e) => setRentData({...rentData, customerName: e.target.value})} className="w-full border-2 border-white shadow-sm rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-4 focus:ring-teal-50 font-medium text-slate-700 bg-white">
                     <option value="">Lütfen listeden bir müşteri seçin...</option>
                     {customers
                       .filter(c => normalizeStr(c.name).includes(normalizeStr(rentCustomerSearch)) || c.customerNo.includes(rentCustomerSearch))
                       .sort((a, b) => {
                           // YENİ: EN SON kaydedilen müşteri her zaman EN ÜSTTE.
                           // Önce kayıt tarihi (createdAt), eşitse id içindeki zaman damgası karşılaştırılır.
                           // (Eski "b.id - a.id" sıralaması 'cust_...' string id'lerde NaN verip çalışmıyordu.)
                           const da = parseAnyDate(a.createdAt)?.getTime() || 0;
                           const dbb = parseAnyDate(b.createdAt)?.getTime() || 0;
                           if (dbb !== da) return dbb - da;
                           return (Number(String(b.id).replace(/\D/g, '')) || 0) - (Number(String(a.id).replace(/\D/g, '')) || 0);
                       })
                       .map((c) => (<option key={c.id} value={c.name}>{c.name} (No: {c.customerNo} - {c.phone})</option>))}
                   </select>
                   <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1"><Info size={12}/> Listede müşteri yoksa önce "Yeni Müşteri Ekle" bölümünden kayıt oluşturun.</p>
                 </div>
               </div>
               <div className="mb-8">
                 <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-full bg-[#1bc5bd] text-white flex items-center justify-center text-xs font-bold">2</div><h4 className="font-bold text-gray-800">Kiralama Şartları</h4></div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Giriş Tarihi</label><input type="date" value={rentData.entryDate} onChange={(e) => setRentData({...rentData, entryDate: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-1 focus:ring-[#1bc5bd] font-medium text-slate-700" /></div>
                   <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">İlk Ödeme Tarihi (Döngü Başı)</label><input type="date" value={rentData.paymentDate} onChange={(e) => setRentData({...rentData, paymentDate: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-1 focus:ring-[#1bc5bd] font-medium text-slate-700" /></div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Aylık Oda Bedeli (TL)</label>
                     <div className="flex flex-col gap-2">
                       <input type="number" placeholder="Örn: 6600" value={rentData.monthlyFee} onChange={(e) => setRentData({...rentData, monthlyFee: e.target.value})} className="w-full border-2 border-red-200 bg-red-50 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-bold text-red-700 text-lg" />
                       <label className="flex items-center gap-2 cursor-pointer mt-1"><input type="checkbox" checked={rentData.hasKdv} onChange={(e) => setRentData({...rentData, hasKdv: e.target.checked})} className="w-4 h-4 text-[#1bc5bd] rounded focus:ring-[#1bc5bd]"/><span className="text-sm font-medium text-gray-700">+ %20 KDV Uygula</span></label>
                       {rentData.hasKdv && rentData.monthlyFee && (<div className="text-xs font-bold text-teal-600">KDV Dahil Tahsil Edilecek: {(Number(rentData.monthlyFee) * 1.2).toFixed(0)} TL</div>)}
                     </div>
                   </div>
                   <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Mühür Numarası</label><input type="text" placeholder="Örn: MH-78451" value={rentData.sealNo} onChange={(e) => setRentData({...rentData, sealNo: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-1 focus:ring-[#1bc5bd] font-medium text-slate-700 uppercase" /></div>
                 </div>
               </div>
               <div className="mb-4">
                 <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-full bg-[#1bc5bd] text-white flex items-center justify-center text-xs font-bold">3</div><h4 className="font-bold text-gray-800">Taşıma Durumu</h4></div>
                 <div className="bg-slate-50 p-5 rounded-xl border border-gray-200">
                   <label className="text-sm font-semibold text-gray-700 mb-3 block">Eşyaları Depoya Kim Getirdi?</label>
                   <div className="flex flex-col sm:flex-row gap-4 mb-2">
                     <label className={`flex-1 flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${rentData.broughtBy === 'kendisi' ? 'border-[#1bc5bd] bg-teal-50/30' : 'border-gray-200 bg-white hover:border-teal-200'}`}><input type="radio" name="broughtBy" value="kendisi" checked={rentData.broughtBy === 'kendisi'} onChange={() => setRentData({...rentData, broughtBy: 'kendisi'})} className="w-5 h-5 text-[#1bc5bd] focus:ring-[#1bc5bd]"/><span className={`font-medium ${rentData.broughtBy === 'kendisi' ? 'text-teal-800' : 'text-gray-600'}`}>Müşteri Kendisi Getirdi</span></label>
                     <label className={`flex-1 flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${rentData.broughtBy === 'sembol' ? 'border-[#1bc5bd] bg-teal-50/30' : 'border-gray-200 bg-white hover:border-teal-200'}`}><input type="radio" name="broughtBy" value="sembol" checked={rentData.broughtBy === 'sembol'} onChange={() => setRentData({...rentData, broughtBy: 'sembol'})} className="w-5 h-5 text-[#1bc5bd] focus:ring-[#1bc5bd]"/><span className={`font-medium ${rentData.broughtBy === 'sembol' ? 'text-teal-800' : 'text-gray-600'}`}>Sembol Nakliyat Getirdi</span></label>
                   </div>
                   {/* YENİ: "Eşyada Hasar Var Mı?" kaldırıldı — yerine HER ZAMAN görünen, duruma göre yazılabilen Not alanı.
                       Bu not kaydedilince odanın profilinde "Not" bölümünde görünür ve oradan sonradan da değiştirilebilir. */}
                   <div className="mt-4 flex flex-col gap-1.5 p-3 bg-white rounded-lg border border-indigo-100 shadow-sm">
                      <label className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Not (Duruma Göre)</label>
                      <textarea rows="2" placeholder="Örn: Eşyada hasar var, özel anlaşma var, dikkat edilmesi gereken bir durum vb." value={rentData.roomNote} onChange={(e) => setRentData({...rentData, roomNote: e.target.value})} className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none font-medium text-gray-700 bg-indigo-50/30"></textarea>
                   </div>
                 </div>
               </div>

               <div className="mb-4">
                 <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-full bg-[#1bc5bd] text-white flex items-center justify-center text-xs font-bold">4</div><h4 className="font-bold text-gray-800">Oda İlk Giriş Görseli & Video Ekle (İsteğe Bağlı)</h4></div>
                 <div className="bg-slate-50 p-5 rounded-xl border border-gray-200">
                    {/* Önizleme: fotoğraf veya video */}
                    {rentData.entryPhoto ? (
                      <div className="flex flex-col items-center mb-4">
                         <div className="text-[#1bc5bd] font-bold flex items-center gap-2 mb-2"><Check size={20} /><span>{rentData.entryMediaType === 'video' ? 'Video Eklendi' : 'Görsel Eklendi'}</span></div>
                         {rentData.entryMediaType === 'video'
                            ? <video src={rentData.entryPhoto} controls className="h-40 w-full max-w-xs object-cover rounded-lg border border-gray-200 bg-black" />
                            : <img src={rentData.entryPhoto} alt="Önizleme" className="h-40 w-full max-w-xs object-cover rounded-lg border border-gray-200" />}
                         <button type="button" onClick={() => setRentData({...rentData, entryPhoto: '', entryMediaType: ''})} className="text-xs text-red-500 font-bold mt-2 hover:underline">Kaldır</button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-5 flex flex-col items-center justify-center text-center bg-white/50 mb-3">
                         <Upload size={20} className="text-gray-400 mb-2" />
                         <span className="text-xs text-gray-500 font-medium">Depoya yerleşim sonrası fotoğraf veya video ekleyin</span>
                         <span className="text-[10px] text-gray-400 mt-1">Fotoğraf (PNG, JPG) veya Video (MP4)</span>
                      </div>
                    )}
                    {/* YENİ EKLENEN: EK GÖRSELLER — birden fazla dosya seçildiğinde ilki yukarıdaki ana
                        alana, kalanlar buraya gelir; her biri tek tek kaldırılabilir. */}
                    {(rentData.entryPhotos || []).length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                         {(rentData.entryPhotos || []).map((m, idx) => (
                           <div key={idx} className="relative border border-gray-200 rounded-lg overflow-hidden bg-white">
                              {m.mediaType === 'video'
                                 ? <video src={m.url} className="h-20 w-full object-cover bg-black" />
                                 : <img src={m.url} alt={`Ek ${idx + 1}`} className="h-20 w-full object-cover" />}
                              <button type="button" onClick={() => setRentData({ ...rentData, entryPhotos: (rentData.entryPhotos || []).filter((_, i) => i !== idx) })} className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow" title="Kaldır"><X size={11}/></button>
                              {m.mediaType === 'video' && <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">VİDEO</span>}
                           </div>
                         ))}
                      </div>
                    )}
                    {/* 3 seçenekli yükleme: Şimdi Çek / Galeriden Seç / Dosyadan Seç
                        GÜNCELLENDİ: Üçü de "multiple" — TOPLU dosya seçilebilir; ortak handleRentMediaFiles işler. */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                       <label className="cursor-pointer flex items-center justify-center gap-1.5 bg-[#1bc5bd] hover:bg-teal-600 text-white rounded-lg py-2.5 text-xs font-bold transition-colors shadow-sm">
                          <Camera size={15}/> Şimdi Çek
                          <input type="file" multiple accept="image/*,video/*" capture="environment" className="hidden" onChange={async (e) => { await handleRentMediaFiles(e.target.files); e.target.value=''; }}/>
                       </label>
                       <label className="cursor-pointer flex items-center justify-center gap-1.5 bg-white border border-gray-300 hover:border-[#1bc5bd] text-gray-700 rounded-lg py-2.5 text-xs font-bold transition-colors shadow-sm">
                          <ImageIcon size={15}/> Galeriden Seç (Çoklu)
                          <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => { await handleRentMediaFiles(e.target.files); e.target.value=''; }}/>
                       </label>
                       <label className="cursor-pointer flex items-center justify-center gap-1.5 bg-white border border-gray-300 hover:border-[#1bc5bd] text-gray-700 rounded-lg py-2.5 text-xs font-bold transition-colors shadow-sm">
                          <FileTextIcon size={15}/> Dosyadan Seç (Çoklu)
                          <input type="file" multiple accept="image/*,video/*,application/octet-stream" className="hidden" onChange={async (e) => { await handleRentMediaFiles(e.target.files); e.target.value=''; }}/>
                       </label>
                    </div>
                 </div>
               </div>
               
               {/* YENİ EKLENEN: Müşteri Sözleşmesi (yazdır / WhatsApp paylaş / imzalı halini cariye yükle) */}
               <div className="mt-6 border border-violet-200 rounded-xl p-4 bg-violet-50/50">
                   <h4 className="text-sm font-bold text-violet-700 mb-1 flex items-center gap-2"><FileTextIcon size={16}/> Müşteri Sözleşmesi & Ödeme Bilgilendirmesi</h4>
                   <p className="text-[11px] text-gray-500 mb-3">Yukarıda girdiğiniz oda ve ödeme bilgileriyle, cari sözleşme şablonunu kullanarak müşteri sözleşmesini hazırlar. Yazdırıp imzalatabilir, WhatsApp'tan paylaşabilir ve imzalı halini müşterinin cari Sözleşmeler bölümüne yükleyebilirsiniz.</p>
                   <div className="flex flex-col sm:flex-row gap-2">
                     <button type="button" onClick={handlePrintRentalContract} className="flex-1 border-2 border-violet-200 text-violet-700 hover:bg-violet-100 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"><FileTextIcon size={14}/> Sözleşme Yazdır</button>
                     <button type="button" onClick={handleShareRentalContract} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"><MessageCircle size={14}/> WhatsApp'tan Paylaş</button>
                   </div>
                   <label className="mt-2 flex items-center justify-center gap-1.5 border-2 border-dashed border-violet-200 text-violet-700 hover:bg-violet-100 rounded-lg py-2 text-xs font-bold cursor-pointer transition-colors">
                     <Upload size={14}/> İmzalı Sözleşmeyi Cariye Yükle
                     <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; const cust = customers.find(c => c.name === rentData.customerName); if(file && cust) await uploadSignedDocToCustomer(cust.id, file, 'Kiralama Sözleşmesi'); else if(file && !cust) alert('İmzalı sözleşmeyi yüklemek için kayıtlı bir müşteri seçili olmalı.'); e.target.value=''; }}/>
                   </label>
               </div>

               <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6"><button onClick={() => setIsRentRoomModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold transition-colors text-sm">İptal Et</button><button onClick={handleRentRoom} disabled={!rentData.customerName || !rentData.monthlyFee} className="bg-[#1bc5bd] hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shadow-teal-500/30"><Check strokeWidth={3} size={20} /> Kiralama Kaydını Tamamla</button></div>
             </div>
          </div>
        </div>
      )}

      {isRentSuccessModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-10 text-center animate-in zoom-in duration-300"><div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Check size={50} strokeWidth={3} /></div><h3 className="text-3xl font-extrabold text-gray-800 mb-3">Oda Kiralandı!</h3><p className="text-gray-500 mb-8 font-medium leading-relaxed">Müşteri ve depo bilgileri başarıyla sisteme işlendi. Ödeme planı ve geçmiş/gelecek yıl tablosu oluşturuldu.</p><button onClick={() => setIsRentSuccessModalOpen(false)} className="bg-green-500 hover:bg-green-600 text-white w-full py-4 rounded-xl font-bold text-lg transition-colors shadow-lg shadow-green-500/30">Oda Detayına Git</button></div>
        </div>
      )}

      {isEditRentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 lg:p-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto relative animate-in fade-in zoom-in duration-200">
             <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-slate-50 rounded-t-2xl sticky top-0 z-10"><h3 className="text-xl font-bold text-[#1bc5bd] flex items-center gap-2"><Edit size={22} /> {selectedRoomDetail?.name} Numaralı Oda - Giriş Bilgilerini Düzenle</h3><button onClick={() => setIsEditRentModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white p-1.5 rounded-full shadow-sm border border-gray-200"><X size={20} /></button></div>
             <div className="p-6 md:p-8">
               <div className="mb-8">
                 <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-full bg-[#1bc5bd] text-white flex items-center justify-center text-xs font-bold">1</div><h4 className="font-bold text-gray-800">Müşteri Seçimi</h4></div>
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                   <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Sistemdeki Müşteriler (Zorunlu)</label>
                   <select value={editRentData.customerName} onChange={(e) => setEditRentData({...editRentData, customerName: e.target.value})} className="w-full border-2 border-white shadow-sm rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-4 focus:ring-teal-50 font-medium text-slate-700 bg-white"><option value="">Lütfen listeden bir müşteri seçin...</option>{[...customers].sort((a, b) => { const da = parseAnyDate(a.createdAt)?.getTime() || 0; const dbb = parseAnyDate(b.createdAt)?.getTime() || 0; if (dbb !== da) return dbb - da; return (Number(String(b.id).replace(/\D/g, '')) || 0) - (Number(String(a.id).replace(/\D/g, '')) || 0); }).map((c) => (<option key={c.id} value={c.name}>{c.name} (No: {c.customerNo} - {c.phone})</option>))}</select>
                 </div>
               </div>
               <div className="mb-8">
                 <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded-full bg-[#1bc5bd] text-white flex items-center justify-center text-xs font-bold">2</div><h4 className="font-bold text-gray-800">Kiralama Şartları</h4></div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Giriş Tarihi</label><input type="date" value={editRentData.entryDate} onChange={(e) => setEditRentData({...editRentData, entryDate: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-1 focus:ring-[#1bc5bd] font-medium text-slate-700" /></div>
                   <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">İlk Ödeme Tarihi (Döngü Başı)</label><input type="date" value={editRentData.paymentDate} onChange={(e) => setEditRentData({...editRentData, paymentDate: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-1 focus:ring-[#1bc5bd] font-medium text-slate-700" /></div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Aylık Oda Bedeli (TL)</label>
                     <div className="flex flex-col gap-2">
                       <input type="number" placeholder="Örn: 6600" value={editRentData.monthlyFee} onChange={(e) => setEditRentData({...editRentData, monthlyFee: e.target.value})} className="w-full border-2 border-red-200 bg-red-50 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 font-bold text-red-700 text-lg" />
                       <label className="flex items-center gap-2 cursor-pointer mt-1"><input type="checkbox" checked={editRentData.hasKdv} onChange={(e) => setEditRentData({...editRentData, hasKdv: e.target.checked})} className="w-4 h-4 text-[#1bc5bd] rounded focus:ring-[#1bc5bd]"/><span className="text-sm font-medium text-gray-700">+ %20 KDV Uygula</span></label>
                       {editRentData.hasKdv && editRentData.monthlyFee && (<div className="text-xs font-bold text-teal-600">KDV Dahil Tahsil Edilecek: {(Number(editRentData.monthlyFee) * 1.2).toFixed(0)} TL</div>)}
                     </div>
                   </div>
                   <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Mühür Numarası</label><input type="text" placeholder="Örn: MH-78451" value={editRentData.sealNo} onChange={(e) => setEditRentData({...editRentData, sealNo: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] focus:ring-1 focus:ring-[#1bc5bd] font-medium text-slate-700 uppercase" /></div>
                 </div>
               </div>
               <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6"><button onClick={() => setIsEditRentModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold transition-colors text-sm">İptal Et</button><button onClick={handleSaveEditRent} disabled={!editRentData.customerName || !editRentData.monthlyFee} className="bg-[#1bc5bd] hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shadow-teal-500/30"><Check strokeWidth={3} size={20} /> Değişiklikleri Kaydet</button></div>
             </div>
          </div>
        </div>
      )}

      {/* Depo/blok/oda ekleme-düzenleme modalları (kontrol kaydı, depo, blok, oda ekle/düzenle) → src/depo.jsx içine taşındı. */}

      {/* YENİ EKLENEN: CARİ BORÇ UYARI EKRANI
          Müşterinin carisinde ödenmemiş borç varsa "Odadan Çıkış Yap" tıklandığında
          çıkış modalı yerine bu uyarı açılır ve çıkış engellenir. */}
      {exitDebtBlock && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in overflow-hidden">
            <div className="p-6 sm:p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4"><AlertCircle size={34}/></div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Oda Çıkışı Yapılamaz</h3>
              <p className="text-sm text-gray-600 leading-relaxed"><b>{exitDebtBlock.customerName || 'Müşteri'}</b> adlı müşterinin{exitDebtBlock.roomName ? <> <b>{exitDebtBlock.roomName}</b> odası için</> : ''} carisinde ödenmemiş borç bulunuyor.</p>
              <div className="my-4 bg-red-50 border border-red-100 rounded-xl px-6 py-3 w-full">
                <div className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Güncel Cari Borç</div>
                <div className="text-2xl font-black text-red-600">{Number(exitDebtBlock.balance || 0).toLocaleString('tr-TR')} TL</div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-6">Oda çıkışı yapabilmek için önce müşterinin <b>cari borcunun sıfırlanması</b> (tahsil edilmesi) gerekmektedir. Lütfen tahsilatı tamamladıktan sonra tekrar deneyin.</p>
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <button onClick={() => setExitDebtBlock(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors">Tamam</button>
                {exitDebtBlock.customerId && (
                  <button onClick={() => { const cid = exitDebtBlock.customerId; setExitDebtBlock(null); setActiveMenu('tum-musteriler'); setSelectedCustomerId(cid); }} className="flex-1 bg-[#1bc5bd] hover:bg-[#16a89f] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"><Wallet size={16}/> Cari Hesaba Git</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* YENİ EKLENEN: HATIRLATMA EKLE / DÜZENLE MODALI */}

      {/* YENİ: İCRA DOSYASI MODALI — Yasal Süreç Takip + Dosya/Foto/Video */}
      {legalFileModalRoomId && (() => {
          const _lr = rooms.find(r => String(r.id) === String(legalFileModalRoomId));
          if (!_lr) return null;
          const _lp = [...(_lr.legalProcess || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
          const _lf = _lr.legalFiles || [];
          const _statusColor = (s) => /ödeme al[ıi]nd[ıi]|kısmi|kismi|dosya kapand/i.test(s) ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : /ihtar|icra|haciz/i.test(s) ? 'bg-red-100 text-red-700 border-red-200' : /ulaşılamadı|ulasilamadi/i.test(s) ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-blue-100 text-blue-700 border-blue-200';
          // ═══════════════════════════════════════════════════════════════════
          // GÜNCELLENDİ: AVUKAT ROLÜ ARTIK İCRA DOSYASINA EKLEME YAPABİLİR
          // ESKİ DAVRANIŞ: Tek bir "_readOnly = isAvukat()" bayrağı hem ekleme
          // hem silme alanlarını kapatıyordu; avukat dosyasına ne süreç hareketi
          // ne de belge ekleyebiliyordu — oysa bu işi asıl yapan kişi avukattır.
          // YENİ DAVRANIŞ: Yetki ikiye ayrıldı:
          //   • _canAddLegal    → süreç hareketi + belge EKLEME (avukata AÇIK)
          //   • _canDeleteLegal → mevcut kayıt/belge SİLME-DÜZENLEME (avukata KAPALI)
          // Böylece avukat dosyayı işleyebilir ama geçmiş kayıtları yanlışlıkla
          // silemez; veri güvenliği korunur.
          // ═══════════════════════════════════════════════════════════════════
          const _isAvukatUser = isAvukat();
          const _canAddLegal = true;              // ekleme: avukat dahil tüm yetkili kullanıcılar
          const _canDeleteLegal = !_isAvukatUser; // silme/düzenleme: avukat hariç
          return (
            <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={() => setLegalFileModalRoomId(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                   <div>
                      <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Shield size={18} className="text-purple-600"/> İcra Dosyası — {_lr.name}</h3>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">{_lr.customerName || 'Müşteri yok'} • Yasal süreç takibi ve belgeler{_isAvukatUser ? ' (ekleme yapabilirsiniz)' : ''}</p>
                   </div>
                   <button onClick={() => setLegalFileModalRoomId(null)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"><X size={16}/></button>
                </div>
                <div className="p-5 space-y-6">
                   {/* SÜREÇ HAREKETİ EKLE/DÜZENLE — avukat dahil ekleme yetkisi olanlara açık */}
                   {_canAddLegal && (
                   <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-4">
                      <h4 className="text-[11px] font-bold text-purple-700 uppercase tracking-wider mb-3">{legalProcForm.id ? 'Süreç Hareketini Düzenle' : 'Yeni Süreç Hareketi Ekle'}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                         <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Tarih</label><input type="date" value={legalProcForm.date} onChange={(e) => setLegalProcForm(f => ({ ...f, date: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400"/></div>
                         <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Durum</label>
                            <select value={legalProcForm.status} onChange={(e) => setLegalProcForm(f => ({ ...f, status: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400 font-bold text-slate-700 cursor-pointer">
                               {LEGAL_PROC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                         </div>
                         <div className="flex flex-col gap-1"><label className="text-[10px] font-bold text-gray-500 uppercase">Tutar (ops. — ödeme alındıysa)</label><input type="number" value={legalProcForm.amount} onChange={(e) => setLegalProcForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400"/></div>
                      </div>
                      <div className="flex flex-col gap-1 mt-3"><label className="text-[10px] font-bold text-gray-500 uppercase">Not / Açıklama</label><textarea rows={2} value={legalProcForm.note} onChange={(e) => setLegalProcForm(f => ({ ...f, note: e.target.value }))} placeholder="Örn: Müşteri arandı, 10 Ağustos'a kadar ödeme sözü verdi..." className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400 resize-none"/></div>
                      <div className="flex justify-end gap-2 mt-3">
                         {legalProcForm.id && <button onClick={() => setLegalProcForm(emptyLegalProcForm())} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-gray-100">Vazgeç</button>}
                         <button onClick={() => handleSaveLegalProcEntry(_lr.id)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5"><Check size={14}/> {legalProcForm.id ? 'Güncelle' : 'Hareketi Ekle'}</button>
                      </div>
                   </div>
                   )}
                   {/* SÜREÇ ZAMAN ÇİZELGESİ */}
                   <div>
                      <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><History size={13}/> Süreç Hareketleri ({_lp.length})</h4>
                      {_lp.length === 0 ? (
                         <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">Henüz süreç hareketi eklenmemiş.</p>
                      ) : (
                         <div className="space-y-2">
                            {_lp.map(e => (
                               <div key={e.id} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                                  <div className="text-[11px] font-bold text-gray-600 whitespace-nowrap pt-0.5">{new Date(e.date + 'T00:00:00').toLocaleDateString('tr-TR')}</div>
                                  <div className="flex-1 min-w-0">
                                     <div className="flex flex-wrap items-center gap-1.5">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${_statusColor(e.status)}`}>{e.status}</span>
                                        {e.amount != null && e.amount !== 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{Number(e.amount).toLocaleString('tr-TR')} TL</span>}
                                     </div>
                                     {e.note ? <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap break-words">{e.note}</p> : null}
                                     {e.createdBy ? <p className="text-[9px] text-gray-300 font-bold mt-1">{e.createdBy}</p> : null}
                                  </div>
                                  {_canDeleteLegal && (
                                  <div className="flex items-center gap-1 shrink-0">
                                     <button onClick={() => setLegalProcForm({ id: e.id, date: e.date, status: e.status, amount: e.amount != null ? String(e.amount) : '', note: e.note || '' })} className="text-amber-600 hover:text-amber-700 p-1" title="Düzenle"><Edit size={13}/></button>
                                     <button onClick={() => handleDeleteLegalProcEntry(_lr.id, e.id)} className="text-red-500 hover:text-red-600 p-1" title="Sil"><Trash2 size={13}/></button>
                                  </div>
                                  )}
                               </div>
                            ))}
                         </div>
                      )}
                   </div>
                   {/* DOSYA / FOTO / VİDEO */}
                   <div>
                      <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><FileTextIcon size={13}/> Belgeler — Fotoğraf / Video / PDF ({_lf.length})</h4>
                      <div className="flex flex-wrap gap-2">
                         {_lf.map(f => (
                            <div key={f.id} className="flex items-center gap-1 bg-purple-50 border border-purple-100 rounded-lg pl-2 pr-1 py-1 text-[11px] font-bold text-purple-700">
                               <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1 max-w-[170px] truncate" title={f.name}>
                                  {f.kind === 'video' ? '🎬' : f.kind === 'pdf' ? '📄' : '🖼️'} {f.name || 'Belge'}
                               </a>
                               {_canDeleteLegal && <button onClick={() => handleRemoveLegalFile(_lr.id, f.id)} className="text-red-500 hover:text-red-700 p-0.5"><X size={12}/></button>}
                            </div>
                         ))}
                         {_canAddLegal && (
                         <label className={`cursor-pointer flex items-center gap-1 bg-white border-2 border-dashed border-purple-200 hover:bg-purple-50 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-purple-600 ${legalFilesUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <Plus size={12}/> {legalFilesUploading ? 'Yükleniyor...' : 'Dosya / Foto / Video Ekle'}
                            <input type="file" multiple accept="image/*,video/*,application/pdf" className="hidden" onChange={async (e) => { const fl = e.target.files; e.persist && e.persist(); await handleAddLegalFiles(_lr.id, fl); e.target.value = ''; }}/>
                         </label>
                         )}
                      </div>
                      {_lf.length === 0 && <p className="text-xs text-gray-400 mt-2">Ekli belge yok.</p>}
                   </div>
                </div>
              </div>
            </div>
          );
      })()}


      {reminderModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in max-h-[92vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center relative sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-indigo-600 mx-auto w-full text-center">{reminderModal.mode === 'edit' ? 'Hatırlatma Düzenle' : 'Yeni Hatırlatma'}</h3>
              <button onClick={() => setReminderModal(null)} className="absolute right-5 text-gray-400 hover:text-red-500"><X size={20}/></button>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-gray-500 uppercase">Tarih</label><input type="date" value={reminderModal.data.date} onChange={(e) => setReminderModal(m => ({ ...m, data: { ...m.data, date: e.target.value } }))} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/></div>
                <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-gray-500 uppercase">Saat (ops.)</label><input type="time" value={reminderModal.data.time} onChange={(e) => setReminderModal(m => ({ ...m, data: { ...m.data, time: e.target.value } }))} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/></div>
              </div>
              <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-gray-500 uppercase">Tür</label>
                <select value={reminderModal.data.type} onChange={(e) => setReminderModal(m => ({ ...m, data: { ...m.data, type: e.target.value } }))} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 font-bold text-slate-700 cursor-pointer">
                  <option value="promise">Ödeme Sözü</option>
                  <option value="note">Günlük Not</option>
                  <option value="task">Görev</option>
                </select>
              </div>
              <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-gray-500 uppercase">Başlık</label>
                <select value={reminderModal.data.title || 'Şirket'} onChange={(e) => setReminderModal(m => ({ ...m, data: { ...m.data, title: e.target.value } }))} className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 font-bold text-slate-700 cursor-pointer">
                  <option value="Şirket">Şirket</option>
                  <option value="Müşteri">Müşteri</option>
                  <option value="Oda">Oda</option>
                  <option value="Cari">Cari</option>
                  <option value="Bilgi">Bilgi</option>
                  <option value="Önemli">Önemli</option>
                  <option value="Personel">Personel</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 relative"><label className="text-[11px] font-bold text-gray-500 uppercase">Müşteri (ops.)</label>
                {/* YENİ EKLENEN: MÜŞTERİYİ ARA — ad, müşteri no veya oda numarasıyla arama yapılabilir.
                    Mevcut "customerName" veri modeline hiç dokunulmadı; seçim yapıldığında aynı alana yazılır. */}
                <input
                    type="text"
                    value={reminderModal.data.customerName ? reminderModal.data.customerName : reminderCustomerSearch}
                    onChange={(e) => {
                        const val = e.target.value;
                        setReminderCustomerSearch(val);
                        setReminderCustomerDropdownOpen(true);
                        // Kullanıcı yeniden yazmaya başlarsa önceki seçim temizlenir (yeni arama için)
                        if (reminderModal.data.customerName) setReminderModal(m => ({ ...m, data: { ...m.data, customerName: '' } }));
                    }}
                    onFocus={() => setReminderCustomerDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setReminderCustomerDropdownOpen(false), 150)}
                    placeholder="Ad, müşteri no veya oda no ile ara (opsiyonel)..."
                    className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 text-slate-700"
                />
                {reminderModal.data.customerName && (
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); setReminderModal(m => ({ ...m, data: { ...m.data, customerName: '' } })); setReminderCustomerSearch(''); }} className="absolute right-2 top-8 text-gray-400 hover:text-red-500" title="Seçimi temizle"><X size={16}/></button>
                )}
                {reminderCustomerDropdownOpen && !reminderModal.data.customerName && (() => {
                    const q = reminderCustomerSearch.trim().toLocaleLowerCase('tr');
                    // Arama: müşteri adı, müşteri no VEYA sahip olduğu oda numaralarından herhangi biriyle eşleşir
                    const results = [...customers]
                        .filter(c => {
                            if (!q) return true;
                            const nameHit = (c.name || '').toLocaleLowerCase('tr').includes(q);
                            const noHit = String(c.customerNo || '').toLocaleLowerCase('tr').includes(q);
                            const roomHit = rooms.some(r => r.customerName === c.name && String(r.name || '').toLocaleLowerCase('tr').includes(q));
                            return nameHit || noHit || roomHit;
                        })
                        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'))
                        .slice(0, 30); // performans: en fazla 30 sonuç listelenir
                    return (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border-2 border-indigo-100 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                            {results.length === 0 ? (
                                <div className="px-3 py-2.5 text-xs text-gray-400">Sonuç bulunamadı.</div>
                            ) : results.map(c => {
                                const custRoomNames = rooms.filter(r => r.customerName === c.name).map(r => r.name).filter(Boolean);
                                return (
                                    <button
                                        type="button"
                                        key={c.id}
                                        onMouseDown={(e) => { e.preventDefault(); setReminderModal(m => ({ ...m, data: { ...m.data, customerName: c.name } })); setReminderCustomerSearch(''); setReminderCustomerDropdownOpen(false); }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-gray-50 last:border-0 flex flex-col"
                                    >
                                        <span className="font-bold text-slate-700">{c.name}</span>
                                        <span className="text-[10px] text-gray-400">Müşteri No: {c.customerNo || '-'}{custRoomNames.length > 0 ? ` • Oda: ${custRoomNames.join(', ')}` : ''}</span>
                                    </button>
                                );
                            })}
                        </div>
                    );
                })()}
              </div>
              <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-gray-500 uppercase">Not / Açıklama</label><textarea rows={3} value={reminderModal.data.note} onChange={(e) => setReminderModal(m => ({ ...m, data: { ...m.data, note: e.target.value } }))} placeholder="Detay..." className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"/></div>
              {/* YENİ: Çoklu belge / fotoğraf / PDF ekleme — eklenip kaldırılabilir */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gray-500 uppercase">Belgeler (fotoğraf / PDF — birden fazla)</label>
                <div className="flex flex-wrap gap-2">
                   {(reminderModal.data.files || []).map((f, i) => (
                      <div key={f.id || i} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 rounded-lg pl-2 pr-1 py-1 text-[11px] font-bold text-indigo-700">
                         <a href={f.url} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1 max-w-[140px] truncate"><FileTextIcon size={12}/> {f.name || 'Belge'}</a>
                         <button onClick={() => setReminderModal(m => ({ ...m, data: { ...m.data, files: (m.data.files || []).filter((_, idx) => idx !== i) } }))} className="text-red-500 hover:text-red-700 p-0.5"><X size={12}/></button>
                      </div>
                   ))}
                   <label className="cursor-pointer flex items-center gap-1 bg-white border-2 border-dashed border-indigo-200 hover:bg-indigo-50 rounded-lg px-2 py-1 text-[11px] font-bold text-indigo-600">
                      <Plus size={12}/> Dosya Ekle
                      <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const fl = Array.from(e.target.files || []); e.target.value = ''; for (const file of fl) { try { const url = await uploadImageToServer(file); setReminderModal(m => ({ ...m, data: { ...m.data, files: [...(m.data.files || []), { id: Date.now() + Math.floor(Math.random() * 10000), name: file.name, url }] } })); } catch (err) { console.error('Belge yükleme hatası:', err); } } }}/>
                   </label>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer"><input type="checkbox" checked={!!reminderModal.data.completed} onChange={(e) => setReminderModal(m => ({ ...m, data: { ...m.data, completed: e.target.checked } }))} className="w-4 h-4"/> Tamamlandı olarak işaretle</label>
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setReminderModal(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2 rounded-xl text-sm font-bold">İptal</button>
                <button onClick={handleSaveReminder} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2"><Check size={16}/> Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEndRentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4 max-h-[92vh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0 relative"><h3 className="text-xl font-medium text-gray-600 mx-auto w-full text-center">Depodan Çıkış Yap</h3><button onClick={() => setIsEndRentModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
             <div className="p-5 sm:p-8 overflow-y-auto flex-1">
               <div className="flex flex-col gap-4 mb-6">
                 <div className="flex flex-col gap-2"><label className="text-xs font-semibold text-gray-600">Çıkış Tarihi</label><input type="date" value={endRentData.exitDate} onChange={(e) => setEndRentData({...endRentData, exitDate: e.target.value})} className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" /></div>

                 {/* YENİ: Eşyanın çıkışını kim yaptı? (ZORUNLU) — Kendisi / Sembol Nakliyat */}
                 <div className="flex flex-col gap-2">
                   <label className="text-xs font-semibold text-gray-600">Eşyanın Çıkışını Kim Yaptı? <span className="text-red-500">*</span></label>
                   <div className="grid grid-cols-2 gap-2">
                     <button type="button" onClick={() => setEndRentData({...endRentData, exitBy: 'kendisi'})} className={`px-3 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${endRentData.exitBy === 'kendisi' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>Kendisi</button>
                     <button type="button" onClick={() => setEndRentData({...endRentData, exitBy: 'sembol'})} className={`px-3 py-2.5 rounded-lg text-sm font-bold border-2 transition-colors ${endRentData.exitBy === 'sembol' ? 'bg-[#1bc5bd] text-white border-[#1bc5bd]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>Sembol Nakliyat</button>
                   </div>
                   {!endRentData.exitBy && <span className="text-[11px] text-red-500 font-medium">Çıkışı onaylamak için bu seçim zorunludur.</span>}
                 </div>

                 <div className="flex flex-col gap-2 mt-2 relative">
                   <label className="text-xs font-semibold text-gray-600">Boş Depo Görseli / Videosu (İsteğe Bağlı)</label>
                   <button type="button" onClick={() => setEndRentUploadMenu(!endRentUploadMenu)} className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer group w-full">
                     {endRentData.photo ? (<div className="text-green-500 font-bold flex flex-col items-center"><Check size={24} className="mb-2" /><span>Dosya Eklendi</span></div>) : (<><Upload size={20} className="text-gray-400 mb-2 group-hover:text-cyan-500 transition-colors" /><span className="text-xs text-gray-500 font-bold">Yükle</span></>)}
                   </button>
                   {endRentUploadMenu && (
                     <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                       <label className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer border-b border-gray-100">
                         <Upload size={15} className="text-cyan-500"/> Şimdi Çek
                         <input type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEndRentData(prev => ({...prev, photo: url})); } setEndRentUploadMenu(false); }}/>
                       </label>
                       <label className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer border-b border-gray-100">
                         <FileTextIcon size={15} className="text-cyan-500"/> Galeriden Seç
                         <input type="file" accept="image/*,video/*" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEndRentData(prev => ({...prev, photo: url})); } setEndRentUploadMenu(false); }}/>
                       </label>
                       <label className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer">
                         <FileTextIcon size={15} className="text-cyan-500"/> Dosyadan Seç
                         <input type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEndRentData(prev => ({...prev, photo: url})); } setEndRentUploadMenu(false); }}/>
                       </label>
                     </div>
                   )}
                 </div>

                 {/* YENİ EKLENEN: ÇIKIŞ TUTANAĞI + DEPO FOTOĞRAFI
                     'Odadan Çıkış Yapma' yetkisi olan personel (bu modalı yalnızca o yetkidekiler açabilir),
                     çıkış yaparken imzalı çıkış tutanağını ve odanın güncel (boş) depo fotoğrafını ekleyebilir.
                     Eklenen belgeler çıkış kaydına (oda geçmişi + müşteri oda geçmişi) işlenir. */}
                 <div className="mt-2 border border-cyan-100 rounded-xl p-4 bg-cyan-50/40">
                   <h4 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><Camera size={16} className="text-cyan-600"/> Çıkış Tutanağı & Depo Fotoğrafı</h4>
                   <p className="text-[11px] text-gray-500 mb-3">İsteğe bağlı — imzalı çıkış tutanağını ve odanın güncel (boş) depo fotoğrafını ekleyin. Bu belgeler çıkış kaydına eklenir ve daha sonra da güncellenebilir.</p>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     {/* Tutanak yükleme */}
                     <div className="relative flex flex-col gap-1.5">
                       <label className="text-[10px] font-bold text-gray-500 uppercase">Çıkış Tutanağı</label>
                       <button type="button" onClick={() => setEndRentDocsMenu(endRentDocsMenu === 'tutanak' ? null : 'tutanak')} className="border-2 border-dashed border-cyan-200 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-white cursor-pointer h-24 w-full transition-colors">
                         {endRentData.tutanak ? (<div className="text-green-600 font-bold flex items-center gap-1"><Check size={16}/> Eklendi</div>) : (<><FileTextIcon size={16} className="text-gray-400 mb-1"/><span className="text-[10px] text-gray-500 font-bold">Yükle</span></>)}
                       </button>
                       {endRentDocsMenu === 'tutanak' && (
                         <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                           <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer border-b border-gray-100">
                             <Upload size={15} className="text-cyan-500"/> Şimdi Çek
                             <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEndRentData(prev => ({...prev, tutanak: url})); } setEndRentDocsMenu(null); }}/>
                           </label>
                           <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer">
                             <FileTextIcon size={15} className="text-cyan-500"/> Galeri / Dosyadan Seç
                             <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEndRentData(prev => ({...prev, tutanak: url})); } setEndRentDocsMenu(null); }}/>
                           </label>
                         </div>
                       )}
                     </div>
                     {/* Depo fotoğrafı yükleme */}
                     <div className="relative flex flex-col gap-1.5">
                       <label className="text-[10px] font-bold text-gray-500 uppercase">Depo Fotoğrafı</label>
                       <button type="button" onClick={() => setEndRentDocsMenu(endRentDocsMenu === 'depo' ? null : 'depo')} className="border-2 border-dashed border-cyan-200 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-white cursor-pointer h-24 w-full transition-colors">
                         {endRentData.depoPhoto ? (<div className="text-green-600 font-bold flex items-center gap-1"><Check size={16}/> Eklendi</div>) : (<><Camera size={16} className="text-gray-400 mb-1"/><span className="text-[10px] text-gray-500 font-bold">Yükle</span></>)}
                       </button>
                       {endRentDocsMenu === 'depo' && (
                         <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                           <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer border-b border-gray-100">
                             <Upload size={15} className="text-cyan-500"/> Şimdi Çek
                             <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEndRentData(prev => ({...prev, depoPhoto: url})); } setEndRentDocsMenu(null); }}/>
                           </label>
                           <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer">
                             <ImageIcon size={15} className="text-cyan-500"/> Galeriden Seç
                             <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEndRentData(prev => ({...prev, depoPhoto: url})); } setEndRentDocsMenu(null); }}/>
                           </label>
                         </div>
                       )}
                     </div>
                   </div>
                 </div>

                 {/* YENİ EKLENEN: TESLİM TUTANAĞI (Müşteri kendisi teslim alırsa) */}
                 <div className="mt-2 border border-gray-200 rounded-xl p-4 bg-slate-50">
                   <h4 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><FileTextIcon size={16} className="text-emerald-600"/> 1) Müşteri Kendisi Teslim Alırsa</h4>
                   <p className="text-[11px] text-gray-500 mb-3">Teslim Tutanağı — eşyaların müşteriye hasarsız/eksiksiz teslim edildiğini beyan eder.</p>
                   <div className="flex flex-col sm:flex-row gap-2">
                     <button type="button" onClick={() => handlePrintExitProtocol('teslim')} className="flex-1 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"><FileTextIcon size={14}/> Teslim Tutanağı Yazdır</button>
                     <button type="button" onClick={() => handleShareExitProtocol('teslim')} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"><MessageCircle size={14}/> WhatsApp'tan Paylaş</button>
                   </div>
                   {/* YENİ EKLENEN: İmzalı Teslim Tutanağını cari Sözleşmeler'e yükle */}
                   <label className="mt-2 flex items-center justify-center gap-1.5 border-2 border-dashed border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg py-2 text-xs font-bold cursor-pointer transition-colors">
                     <Upload size={14}/> İmzalı Tutanağı Cariye Yükle
                     <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; const room = rooms.find(r => String(r.id) === String(selectedRoomId)); const cust = customers.find(c => c.name === room?.customerName); if(file && cust) await uploadSignedDocToCustomer(cust.id, file, 'Teslim Tutanağı'); e.target.value=''; }}/>
                   </label>
                 </div>

                 {/* YENİ EKLENEN: NAKLİYE HASAR TUTANAĞI (Müşteri başka nakliyeciden alırsa) */}
                 <div className="border border-gray-200 rounded-xl p-4 bg-slate-50">
                   <h4 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><FileTextIcon size={16} className="text-orange-600"/> 2) Başka Nakliyeci Teslim Alırsa</h4>
                   <p className="text-[11px] text-gray-500 mb-3">Nakliye Hasar Tutanağı — taşıma sırasındaki hasarlardan nakliye firmasının sorumlu olduğunu taahhüt eder.</p>
                   <div className="grid grid-cols-1 gap-2 mb-3">
                     <input type="text" value={endRentData.carrierName} onChange={(e) => setEndRentData({...endRentData, carrierName: e.target.value})} placeholder="Nakliye Firması Ünvanı" className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-400 font-medium text-slate-700" />
                     <input type="text" value={endRentData.carrierVkn} onChange={(e) => setEndRentData({...endRentData, carrierVkn: e.target.value})} placeholder="Nakliye Firması VKN" className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-400 font-medium text-slate-700" />
                     <input type="text" value={endRentData.carrierAuthorized} onChange={(e) => setEndRentData({...endRentData, carrierAuthorized: e.target.value})} placeholder="Yetkili Kişi Ad Soyad" className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-400 font-medium text-slate-700" />
                   </div>
                   <div className="flex flex-col sm:flex-row gap-2">
                     <button type="button" onClick={() => handlePrintExitProtocol('nakliye')} className="flex-1 border-2 border-orange-200 text-orange-700 hover:bg-orange-50 rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"><FileTextIcon size={14}/> Başka Nakliye Teslim Tutanağı</button>
                     <button type="button" onClick={() => handleShareExitProtocol('nakliye')} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"><MessageCircle size={14}/> WhatsApp'tan Paylaş</button>
                   </div>
                   {/* YENİ EKLENEN: İmzalı Nakliye Hasar Tutanağını cari Sözleşmeler'e yükle */}
                   <label className="mt-2 flex items-center justify-center gap-1.5 border-2 border-dashed border-orange-200 text-orange-700 hover:bg-orange-50 rounded-lg py-2 text-xs font-bold cursor-pointer transition-colors">
                     <Upload size={14}/> İmzalı Tutanağı Cariye Yükle
                     <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; const room = rooms.find(r => String(r.id) === String(selectedRoomId)); const cust = customers.find(c => c.name === room?.customerName); if(file && cust) await uploadSignedDocToCustomer(cust.id, file, 'Nakliye Hasar Tutanağı'); e.target.value=''; }}/>
                   </label>
                 </div>

                 {/* YENİ: 3) EŞYALARI BAŞKASI TESLİM ALIRSA — Teslim Vekaleti */}
                 <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 mb-4">
                   <h4 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><Shield size={16} className="text-emerald-600"/> 3) Eşyaları Müşteri Adına Başkası Teslim Alırsa</h4>
                   <p className="text-[11px] text-gray-500 mb-3">Teslim Vekaleti — müşterinin, eşyalarını başka birinin (vekilin) teslim almasına / depoyu tahliye etmesine izin verdiği tutanak. Yetki verilecek kişinin bilgilerini girin.</p>
                   <div className="grid grid-cols-1 gap-2 mb-3">
                     <input type="text" value={vekaletData.vekilName} onChange={(e) => setVekaletData({...vekaletData, vekilName: e.target.value})} placeholder="Yetki Verilecek Kişi Ad Soyad" className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-400 font-medium text-slate-700" />
                     <input type="text" value={vekaletData.vekilTc} onChange={(e) => setVekaletData({...vekaletData, vekilTc: e.target.value})} placeholder="Yetki Verilecek Kişi T.C. Kimlik No" className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-400 font-medium text-slate-700" />
                   </div>
                   <div className="flex flex-col sm:flex-row gap-2">
                     <button type="button" onClick={() => handlePrintVekalet('teslim')} disabled={!vekaletData.vekilName || !vekaletData.vekilTc} className="flex-1 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"><FileTextIcon size={14}/> Teslim Vekaleti Yazdır</button>
                     <button type="button" onClick={() => handleShareVekalet('teslim')} disabled={!vekaletData.vekilName || !vekaletData.vekilTc} className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"><MessageCircle size={14}/> WhatsApp'tan Gönder</button>
                   </div>
                 </div>
               </div>
               <div className="flex justify-end gap-3"><button onClick={() => setIsEndRentModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded text-sm font-medium">İptal</button><button onClick={handleEndRentConfirm} disabled={!endRentData.exitBy} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded text-sm font-medium flex items-center gap-2"><LogOut size={16} /> Çıkışı Onayla</button></div>
             </div>
          </div>
        </div>
      )}

      {/* ZAM YAPMA MODALI (YENİ EKLENDİ) */}
      {isApplyIncreaseModalOpen && increaseModalData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-indigo-700 flex items-center gap-2"><TrendingUp size={20} /> Zam Yap ({increaseModalData.name})</h3>
                 <button onClick={() => setIsApplyIncreaseModalOpen(false)} className="text-indigo-400 hover:text-indigo-600 bg-white p-1 rounded shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-6 md:p-8">
               <p className="text-sm text-gray-500 mb-6 text-center"><strong>{increaseModalData.customerName}</strong> müşterisinin <strong>{increaseModalData.targetYear}</strong> yılı zammını uygulamak üzeresiniz. Zam Baz Alınan Kira (Mevcut Kira, KDV Dahil): <strong>{Math.round(Number(increaseModalData.increaseBaseFee ?? increaseModalData.monthlyFee)).toLocaleString('tr-TR')} TL</strong></p>
               
               <div className="flex gap-4 mb-6 border-b border-gray-200 pb-4">
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="incMode" checked={increaseMode === 'percentage'} onChange={() => setIncreaseMode('percentage')} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                      <span className={`text-sm font-bold ${increaseMode === 'percentage' ? 'text-indigo-700' : 'text-gray-500'}`}>Zam Oranı İle Yap</span>
                   </label>
                   <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="incMode" checked={increaseMode === 'manual'} onChange={() => setIncreaseMode('manual')} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                      <span className={`text-sm font-bold ${increaseMode === 'manual' ? 'text-indigo-700' : 'text-gray-500'}`}>Yeni Tutar Belirle</span>
                   </label>
               </div>

               <div className="flex flex-col gap-5 mb-8">
                 <div className="flex flex-col gap-2">
                     <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Uygulanacak Zam Oranı (%)</label>
                     <div className="relative">
                         <input type="number" disabled={increaseMode !== 'percentage'} value={increasePercentage} onChange={(e) => handlePercentageInput(e.target.value)} className={`w-full border-2 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none transition-colors ${increaseMode === 'percentage' ? 'border-indigo-300 focus:border-indigo-500 bg-white text-indigo-900' : 'border-gray-200 bg-gray-50 text-gray-400'}`} />
                         <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-gray-400">%</span>
                     </div>
                 </div>
                 <div className="flex flex-col gap-2">
                     <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Yeni Kira Bedeli (TL, KDV Dahil)</label>
                     <div className="relative">
                         <input type="number" disabled={increaseMode !== 'manual'} value={newRentAmount} onChange={(e) => handleAmountInput(e.target.value)} className={`w-full border-2 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none transition-colors ${increaseMode === 'manual' ? 'border-indigo-300 focus:border-indigo-500 bg-white text-indigo-900' : 'border-gray-200 bg-gray-50 text-gray-400'}`} />
                         <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-gray-400">TL</span>
                     </div>
                 </div>
               </div>
               
               <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                   <button onClick={() => setIsApplyIncreaseModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl text-sm font-bold transition-colors">İptal</button>
                   <button onClick={handleConfirmIncrease} disabled={!newRentAmount} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 transition-colors flex items-center gap-2"><Check strokeWidth={3} size={18}/> Zammı Uygula</button>
               </div>
             </div>
          </div>
        </div>
      )}

      {isChangeRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in overflow-visible max-h-[90vh] flex flex-col">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0 relative"><h3 className="text-xl font-medium text-gray-600 mx-auto w-full text-center">Oda Değiştir</h3><button onClick={() => setIsChangeRoomModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
             <div className="p-8 overflow-y-auto">
               <p className="text-sm text-gray-500 mb-6 text-center">Müşteri ve tüm işlemleri yeni odaya taşınacaktır. Eski oda boşaltılıp geçmişine kayıt eklenecektir.</p>

               {/* YENİ: KİRA MODU SEÇİMİ — Aynı Kira Devam Etsin / Yeni Kira Belirle */}
               <div className="mb-6 border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                   <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">Kira Durumu</label>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                       <button type="button" onClick={() => setChangeRoomFeeMode('same')} className={`text-left px-4 py-3 rounded-lg border-2 transition-colors ${changeRoomFeeMode === 'same' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                           <span className={`text-sm font-bold ${changeRoomFeeMode === 'same' ? 'text-orange-700' : 'text-gray-700'}`}>Aynı Kira Devam Etsin</span>
                           <p className="text-[11px] text-gray-500 mt-0.5">Eski odanın kirası, giriş tarihi ve cari borçlanma şekli aynen yeni odaya taşınır.</p>
                       </button>
                       <button type="button" onClick={() => setChangeRoomFeeMode('new')} className={`text-left px-4 py-3 rounded-lg border-2 transition-colors ${changeRoomFeeMode === 'new' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                           <span className={`text-sm font-bold ${changeRoomFeeMode === 'new' ? 'text-orange-700' : 'text-gray-700'}`}>Yeni Kira Belirle</span>
                           <p className="text-[11px] text-gray-500 mt-0.5">Eski oda bugün çıkış yapmış gibi kapanır (kalan borç cariye işlenir); yeni odada bugünden itibaren YENİ kira ile sıfırdan kiralama ve yeni sözleşme başlar.</p>
                       </button>
                   </div>
                   {changeRoomFeeMode === 'new' && (
                       <div className="flex flex-col gap-1.5 mt-2 animate-in fade-in">
                           <label className="text-xs font-semibold text-gray-600">Yeni Kira Bedeli (KDV Dahil, TL)</label>
                           <input type="number" value={changeRoomNewFee} onChange={(e) => setChangeRoomNewFee(e.target.value)} placeholder="Örn: 6000" className="border-2 border-orange-300 rounded-lg px-3 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:border-orange-500" />
                           <p className="text-[10px] text-gray-400">Girilen tutar KDV dahil kabul edilir; aylık borçlanma bu tutar üzerinden başlar.</p>
                       </div>
                   )}
               </div>

               <div className="flex flex-col gap-4 mb-6">
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-semibold text-gray-600">Depo (Şube) Seç</label>
                   <select value={changeRoomWarehouseId} onChange={(e) => {setChangeRoomWarehouseId(e.target.value); setChangeRoomBlockId(''); setChangeRoomTargetRoomId('');}} className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none text-gray-700">
                     <option value="">Lütfen Depo Seçin</option>
                     {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                   </select>
                 </div>
                 
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-semibold text-gray-600">Blok Seç</label>
                   <select disabled={!changeRoomWarehouseId} value={changeRoomBlockId} onChange={(e) => {setChangeRoomBlockId(e.target.value); setChangeRoomTargetRoomId('');}} className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none text-gray-700 disabled:bg-gray-100">
                     <option value="">Lütfen Blok Seçin</option>
                     {blocks.filter(b => b.warehouseId === parseInt(changeRoomWarehouseId)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                   </select>
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-semibold text-gray-600">Oda Seç (Sadece Boş Odalar)</label>
                   <select disabled={!changeRoomBlockId} value={changeRoomTargetRoomId} onChange={(e) => setChangeRoomTargetRoomId(e.target.value)} className="border border-orange-400 focus:ring-1 focus:ring-orange-400 rounded px-3 py-2 text-sm focus:outline-none text-gray-700 disabled:bg-gray-100 disabled:border-gray-300">
                     <option value="">Lütfen Oda Seçin</option>
                     {rooms.filter(r => r.blockId === parseInt(changeRoomBlockId) && !r.customerName && (!r.isReserved || r.reserveExpiryTimestamp < Date.now())).map(r => <option key={r.id} value={r.id}>{r.name} ({r.m3}m³)</option>)}
                   </select>
                 </div>
               </div>

               <div className="flex justify-end gap-3">
                 <button onClick={() => setIsChangeRoomModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded text-sm font-medium">İptal</button>
                 <button onClick={handleChangeRoomConfirm} disabled={!changeRoomTargetRoomId || (changeRoomFeeMode === 'new' && !changeRoomNewFee)} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-medium flex items-center gap-2"><RefreshCcw size={16}/> Odayı Değiştir</button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* DİNAMİK ZAM GEÇMİŞİ MODALI */}
      {isPriceHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl animate-in fade-in zoom-in flex flex-col max-h-[90vh]">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl shrink-0">
                 <h3 className="text-xl font-bold text-indigo-700 flex items-center gap-2"><TrendingUp size={20} /> Zam Geçmişi ({selectedRoomDetail?.name})</h3>
                 <button onClick={() => setIsPriceHistoryModalOpen(false)} className="bg-white p-1 rounded shadow-sm text-indigo-400 hover:text-indigo-600"><X size={20} /></button>
             </div>
             <div className="p-6 overflow-y-auto flex-1">
               <div className="flex items-center gap-3 mb-6 bg-gray-50 p-3 rounded-xl border border-gray-200">
                   <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg">{selectedRoomDetail?.customerName?.charAt(0) || 'M'}</div>
                   <div>
                       <h4 className="font-bold text-gray-800 text-[15px] leading-tight">{selectedRoomDetail?.customerName}</h4>
                       <span className="text-[11px] text-gray-500 font-medium">İlk Giriş: {selectedRoomDetail?.entryDate}</span>
                   </div>
               </div>
               
               <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                   <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700 text-xs uppercase tracking-wider">
                          <tr>
                              <th className="p-4">İşlem Tarihi</th>
                              <th className="p-4">İlgili Yıl (Senesi)</th>
                              <th className="p-4 text-center">Uygulanan Zam (%)</th>
                              <th className="p-4 text-right">Eski Tutar</th>
                              <th className="p-4 text-right">Yeni Tutar</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {selectedRoomDetail?.priceHistory && selectedRoomDetail.priceHistory.length > 0 ? (
                              selectedRoomDetail.priceHistory.map((ph, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                      <td className="p-4 font-medium text-gray-800">{ph.date}</td>
                                      <td className="p-4 font-bold text-indigo-600">{ph.anniversaryYear} Yılı Zammı</td>
                                      <td className="p-4 text-center">
                                          <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold">% {ph.percentage}</span>
                                      </td>
                                      <td className="p-4 text-right text-gray-400 font-semibold line-through">{ph.oldFee} TL</td>
                                      <td className="p-4 text-right text-emerald-600 font-extrabold">{ph.newFee} TL</td>
                                  </tr>
                              ))
                          ) : (
                              <tr>
                                  <td colSpan="5" className="p-8 text-center text-gray-500 font-medium">Bu odanın güncel kiracısına ait herhangi bir zam işlemi kaydedilmemiş.</td>
                              </tr>
                          )}
                      </tbody>
                   </table>
               </div>
             </div>
             <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end shrink-0">
                 <button onClick={() => setIsPriceHistoryModalOpen(false)} className="bg-gray-800 hover:bg-gray-900 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-colors">Kapat</button>
             </div>
          </div>
        </div>
      )}

      {/* GEÇMİŞ ZAMLARI DÜZENLE MODALI */}
      {isPastIncreaseModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-orange-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-orange-700 flex items-center gap-2"><Edit size={20} /> Geçmiş Zamları Düzenle</h3>
                 <button onClick={() => setIsPastIncreaseModalOpen(false)} className="text-orange-400 hover:text-orange-600 bg-white p-1 rounded shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-6 md:p-8">
               <p className="text-sm text-gray-500 mb-6 text-center">Bu menüden geçmiş bir tarihe zam uygulayabilirsiniz. Belirttiğiniz tarihten itibaren <strong>1 yıl boyunca (12 ay)</strong> kira bedeli yeni girdiğiniz tutar olarak ayarlanacaktır. Öncesi ve sonrası değişmez.</p>
               
               <div className="flex flex-col gap-5 mb-8">
                 <div className="flex flex-col gap-2">
                     <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Zammın Geçerli Olacağı Tarih</label>
                     <input type="date" value={pastIncreaseData.date} onChange={(e) => setPastIncreaseData({...pastIncreaseData, date: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-bold text-slate-700" />
                 </div>
<div className="flex flex-col gap-2">
                     <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Uygulanacak Yeni Kira Bedeli (TL)</label>
                     <div className="relative">
                         <input type="number" placeholder="Örn: 2500" value={pastIncreaseData.amount} onChange={(e) => setPastIncreaseData({...pastIncreaseData, amount: e.target.value})} className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-orange-500 bg-orange-50/50 text-orange-900" />
                         <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-orange-400">TL</span>
                     </div>
                     <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input type="checkbox" checked={pastIncreaseData.isKdvIncluded} onChange={(e) => setPastIncreaseData({...pastIncreaseData, isKdvIncluded: e.target.checked})} className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"/>
                        <span className="text-sm font-bold text-gray-700">Yazdığım Tutar KDV DAHİL Tutardır</span>
                     </label>
                 </div>               </div>
               
               <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                   <button onClick={() => setIsPastIncreaseModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl text-sm font-bold transition-colors">İptal</button>
                   <button onClick={handleSavePastIncrease} disabled={!pastIncreaseData.date || !pastIncreaseData.amount} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-8 py-3 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/30 transition-colors flex items-center gap-2"><Check strokeWidth={3} size={18}/> Geçmiş Zammı Uygula</button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* BELİRLİ AYIN KİRASINI DÜZENLE MODALI */}
      {isEditSpecificMonthModalOpen && specificMonthEditData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-orange-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-orange-700 flex items-center gap-2"><Edit size={20} /> Kira Düzenle</h3>
                 <button onClick={() => setIsEditSpecificMonthModalOpen(false)} className="text-orange-400 hover:text-orange-600 bg-white p-1 rounded shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-6">
               <p className="text-sm text-gray-500 mb-6 text-center">Sadece bu ay için geçerli olacak yeni kira tutarını belirleyin. Bu tutar cari hesaba doğrudan işlenecektir.</p>
               
               <div className="flex flex-col gap-4 mb-6">
                 <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center">
                     <span className="text-xs font-bold text-gray-500 block mb-1">İlgili Dönem</span>
                     <span className="text-sm font-bold text-gray-800">{specificMonthEditData.title}</span>
                 </div>
                 <div className="flex flex-col gap-2">
                     <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Yeni Kira Tutarını Girin (TL)</label>
                     <div className="relative">
                         <input type="number" value={specificMonthEditData.newAmount} onChange={(e) => setSpecificMonthEditData({...specificMonthEditData, newAmount: e.target.value})} className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 text-xl font-black focus:outline-none focus:border-orange-500 bg-orange-50/30 text-orange-900" />
                         <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-orange-400">TL</span>
                     </div>
                 </div>
               </div>
               
               <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-gray-100 w-full gap-3">
                   <button onClick={handleGiftSpecificMonth} className="w-full sm:w-auto bg-purple-50 hover:bg-purple-100 text-purple-600 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 border border-purple-200 shadow-sm">
                       <Gift size={16}/> Bu Ayı Hediye Ver
                   </button>
                   <div className="flex gap-3 w-full sm:w-auto justify-end">
                       <button onClick={() => setIsEditSpecificMonthModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-colors">İptal</button>
                       <button onClick={handleSaveSpecificMonthEdit} disabled={!specificMonthEditData.newAmount} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/30 transition-colors flex items-center gap-2"><Check strokeWidth={3} size={16}/> Güncelle</button>
                   </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-bold text-red-600 w-full text-center">Tüm Sistemi Sıfırla</h3><button onClick={() => setIsResetModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
             <div className="p-6 text-center">
                <div className="mx-auto bg-red-50 text-red-500 w-12 h-12 flex items-center justify-center rounded-full mb-4"><RefreshCcw size={24} /></div>
                <p className="text-gray-600 mb-6 text-sm">Tüm odalardaki müşteriler boşaltılacak ve depo ile bloklara ait doluluk sayaçları tamamen sıfırlanacaktır. Bu işlem geri alınamaz. Onaylıyor musunuz?</p>
                <div className="flex justify-center gap-3"><button onClick={() => setIsResetModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded font-medium transition-colors text-sm">İptal</button><button onClick={handleResetAll} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-medium transition-colors flex items-center gap-2 text-sm"><RefreshCcw size={16} /> Evet, Sıfırla</button></div>
             </div>
          </div>
        </div>
      )}

      {/* İCRA SÜRECİ MODALI */}
      {isLegalActionModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className={`p-5 border-b border-gray-100 flex justify-between items-center rounded-t-2xl ${legalActionData.type === 'start' ? 'bg-red-50' : 'bg-gray-50'}`}>
                 <h3 className={`text-lg font-bold flex items-center gap-2 ${legalActionData.type === 'start' ? 'text-red-700' : 'text-gray-800'}`}>
                     <Shield size={18} /> {legalActionData.type === 'start' ? 'İcra (Yasal Takip) Başlat' : 'İcra Sürecini Kaldır'}
                 </h3>
                 <button onClick={() => setIsLegalActionModalOpen(false)}><X size={20} className="text-gray-500 hover:text-red-600"/></button>
             </div>
             <div className="p-6">
                {legalActionData.type === 'start' ? (
                    <>
                        <p className="text-sm text-red-600 mb-5 font-medium text-center">Bu işlem müşterinin ve odanın statüsünü icralık olarak değiştirecektir. <strong>Sistem bu oda için aylık kira borçlanmasını an itibariyle durduracaktır!</strong></p>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">İcra Nedeni / Açıklama (Zorunlu)</label>
                            <textarea rows="3" value={legalActionData.reason} onChange={(e) => setLegalActionData({...legalActionData, reason: e.target.value})} placeholder="Örn: 5 aydır ödeme alınamadığı için avukata verildi..." className="w-full border-2 border-red-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 resize-none font-medium text-gray-700 bg-red-50/30"></textarea>
                        </div>
                    </>
                ) : (
                    <div className="text-center">
                        <div className="mx-auto bg-gray-100 text-gray-600 w-16 h-16 flex items-center justify-center rounded-full mb-4"><RefreshCcw size={32} /></div>
                        <p className="text-sm text-gray-600 font-medium mb-2">İcra sürecini kaldırıp müşteriyi normal kiralama statüsüne döndürmek üzeresiniz.</p>
                        <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 p-2 rounded-lg">Bu işlemden sonra sistem <strong>eksik kalan ayları tekrar hesaplayıp carisine borç yazarak</strong> normale dönecektir.</p>
                    </div>
                )}
                
                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button onClick={() => setIsLegalActionModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors">İptal</button>
                  <button onClick={handleLegalActionConfirm} disabled={legalActionData.type === 'start' && !legalActionData.reason} className={`disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-colors flex items-center gap-2 ${legalActionData.type === 'start' ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30' : 'bg-gray-800 hover:bg-gray-900 shadow-gray-500/30'}`}>
                      {legalActionData.type === 'start' ? <><Shield size={18}/> İcrayı Başlat</> : <><RefreshCcw size={18}/> İcrayı Kaldır ve Normale Dön</>}
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          YENİ: ÖDEME SÖZÜ GÜNCELLEME PENCERESİ
          Not girilir, kayıt seçilen güne (varsayılan BUGÜN) taşınır ve
          not tarihiyle birlikte geçmişe eklenir.
          ═══════════════════════════════════════════════════════════════════ */}
      {isPromiseUpdateOpen && promiseUpdateTarget && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setIsPromiseUpdateOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-orange-50 rounded-t-2xl">
                 <h3 className="text-base font-bold text-orange-700 flex items-center gap-2"><RefreshCcw size={17} /> Ödeme Sözü Güncelle</h3>
                 <button onClick={() => setIsPromiseUpdateOpen(false)}><X size={20} className="text-orange-400 hover:text-orange-600"/></button>
             </div>
             <div className="p-6 flex flex-col gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Müşteri</p>
                    <p className="text-sm font-black text-slate-800">{promiseUpdateTarget.customerName || '-'}</p>
                    <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
                        Mevcut söz tarihi: {promiseUpdateTarget.date ? new Date(promiseUpdateTarget.date).toLocaleDateString('tr-TR') : '-'}
                    </p>
                </div>

                {/* Önceki güncellemeler — tarihiyle birlikte */}
                {Array.isArray(promiseUpdateTarget.promiseUpdates) && promiseUpdateTarget.promiseUpdates.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Önceki Güncellemeler</p>
                        {promiseUpdateTarget.promiseUpdates.slice().sort((a,b)=>(a.at||0)-(b.at||0)).map(u => (
                            <div key={u.id} className="bg-orange-50/70 border-l-[3px] border-orange-400 rounded-r-md px-2.5 py-1.5">
                                <div className="text-[12px] text-slate-700 font-medium whitespace-pre-wrap">{u.text}</div>
                                <div className="text-[9px] text-gray-400 font-bold mt-0.5">
                                    {u.at ? new Date(u.at).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : ''}{u.by ? ` · ${u.by}` : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Yeni Not (Zorunlu)</label>
                    <textarea rows="3" value={promiseUpdateText} onChange={(e) => setPromiseUpdateText(e.target.value)} placeholder="Örn: Bugün arandı, cuma günü ödeme yapacağını belirtti." className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 resize-none font-medium text-gray-700 bg-orange-50/30"></textarea>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Takvimde Taşınacağı Gün</label>
                    <input type="date" value={promiseUpdateDate} onChange={(e) => setPromiseUpdateDate(e.target.value)} className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-orange-500 text-slate-700 bg-orange-50/30" />
                    <span className="text-[10px] text-gray-400 font-semibold">Varsayılan bugündür — kayıt takvimde bu güne taşınır.</span>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                  <button onClick={() => setIsPromiseUpdateOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors">İptal</button>
                  <button onClick={handleSavePromiseUpdate} disabled={!promiseUpdateText.trim()} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/30 flex items-center gap-2 transition-colors"><Check strokeWidth={3} size={17}/> Güncelle</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* HEDİYE AY VER MODALI */}
      {isGiftModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-purple-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-purple-700 flex items-center gap-2"><Gift size={18} /> Hediye Ay Ver</h3>
                 <button onClick={() => setIsGiftModalOpen(false)}><X size={20} className="text-purple-400 hover:text-purple-600"/></button>
             </div>
             <div className="p-6">
                <p className="text-sm text-gray-500 mb-5 text-center">Hediye, <b>aşağıda seçtiğiniz aydan</b> başlayarak uygulanır. Bu aylar cari hesapta <b>0 TL (HEDİYE)</b> olarak görünür ve borç yansıtılmaz.</p>

                {/* YENİ: HEDİYENİN BAŞLAYACAĞI AY — varsayılan olarak içinde bulunulan ay seçilidir */}
                <div className="flex flex-col gap-2 mb-5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider text-center">Hediye Edilecek Ay</label>
                    <select
                        value={giftStartMonthKey}
                        onChange={(e) => setGiftStartMonthKey(e.target.value)}
                        className="w-full border-2 border-purple-200 rounded-xl px-3 py-3 text-sm font-bold focus:outline-none focus:border-purple-500 text-purple-700 bg-purple-50/50"
                    >
                        {(() => {
                            // Odanın giriş ayından bugünün 12 ay sonrasına kadar seçenek üretilir
                            const _r = rooms.find(x => String(x.id) === String(selectedRoomId));
                            const _e = _r ? parseDateLocal(_r.paymentDate && _r.paymentDate.includes('-') ? _r.paymentDate : (_r.entryDate || '2026-01-01')) : new Date();
                            const _startIdx = _e.getFullYear() * 12 + _e.getMonth();
                            const _n = new Date();
                            const _endIdx = _n.getFullYear() * 12 + _n.getMonth() + 12;
                            const _ms = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
                            const _opts = [];
                            for (let i = _startIdx; i <= _endIdx; i++) {
                                const _y = Math.floor(i / 12), _m = i % 12;
                                _opts.push(<option key={`${_y}-${_m}`} value={`${_y}-${_m}`}>{_ms[_m]} {_y}</option>);
                            }
                            return _opts;
                        })()}
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider text-center">Hediye Edilecek Ay Sayısı</label>
                    <div className="flex items-center justify-center gap-4 mt-2">
                        <button onClick={() => setGiftMonthValue(prev => Math.max(1, prev - 1))} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-xl transition-colors">-</button>
                        <input type="number" min="1" max="12" value={giftMonthValue} onChange={(e) => setGiftMonthValue(parseInt(e.target.value) || 1)} className="w-20 border-2 border-purple-200 rounded-xl px-2 py-2 text-2xl font-black focus:outline-none focus:border-purple-500 text-center text-purple-700 bg-purple-50/50" />
                        <button onClick={() => setGiftMonthValue(prev => prev + 1)} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-xl transition-colors">+</button>
                    </div>
                </div>
                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button onClick={() => setIsGiftModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors">İptal</button>
                  <button onClick={() => handleSetGiftMonths(giftMonthValue)} disabled={giftMonthValue < 1} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-purple-500/30 flex items-center gap-2 transition-colors"><Check strokeWidth={3} size={18}/> Onayla</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* ÜCRETSİZ ODA YAP MODALI */}
      {isFreeRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-cyan-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-cyan-700 flex items-center gap-2"><Gift size={18} /> Ücretsiz Oda Yap</h3>
                 <button onClick={() => setIsFreeRoomModalOpen(false)}><X size={20} className="text-cyan-400 hover:text-cyan-600"/></button>
             </div>
             <div className="p-6">
                <p className="text-sm text-gray-500 mb-5 text-center">Bu odayı ücretsiz yaptığınızda müşterinin cari hesabına kira borcu yansıtılmaz. Lütfen bu işlemin nedenini aşağıya yazınız.</p>
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Ücretsiz Yapma Nedeni (Zorunlu)</label>
                    <textarea rows="3" value={freeRoomReasonInput} onChange={(e) => setFreeRoomReasonInput(e.target.value)} placeholder="Örn: Şirket personeli, kampanya dahilinde vb." className="w-full border-2 border-cyan-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 resize-none font-medium text-gray-700 bg-cyan-50/30"></textarea>
                </div>
                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button onClick={() => setIsFreeRoomModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors">İptal</button>
                  <button onClick={handleSetFreeRoom} disabled={!freeRoomReasonInput} className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-cyan-500/30 flex items-center gap-2 transition-colors"><Check strokeWidth={3} size={18}/> Onayla</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {isReserveRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 lg:p-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
             <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-slate-50 rounded-t-2xl"><h3 className="text-lg font-bold text-orange-500 flex items-center gap-2"><Calendar size={20} /> Odayı Rezerve Et</h3><button onClick={() => setIsReserveRoomModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white p-1 rounded-full shadow-sm"><X size={20} /></button></div>
             <div className="p-6">
               <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Müşteri Ad Soyad</label><input type="text" value={reserveData.name} onChange={(e) => setReserveData({...reserveData, name: e.target.value.toUpperCase()})} placeholder="Örn: AHMET YILMAZ" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Telefon Numarası</label><input type="text" value={reserveData.phone} onChange={(e) => setReserveData({...reserveData, phone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Rezerve Süresi (Maks 10 Gün)</label><input type="number" min="1" max="10" value={reserveData.days} onChange={(e) => setReserveData({...reserveData, days: e.target.value > 10 ? 10 : e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 font-medium text-slate-700" /><p className="text-[10px] text-gray-400 mt-1">Sistem, belirtilen gün dolduğunda odayı otomatik olarak tekrar boş konuma düşürür.</p></div>
               </div>
               <div className="mt-8 flex justify-end gap-3"><button onClick={() => setIsReserveRoomModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-bold transition-colors text-sm">İptal</button><button onClick={handleReserveRoom} disabled={!reserveData.name || !reserveData.phone || !reserveData.days} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-orange-500/30 flex items-center gap-2"><Check size={18} /> Rezerveyi Kaydet</button></div>
             </div>
          </div>
        </div>
      )}

      {isRoomHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-xl font-medium text-gray-600 mx-auto w-full text-center">{selectedRoomDetail?.name || 'Seçili Oda'} - Kiralama Geçmişi</h3><button onClick={() => setIsRoomHistoryModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-gray-600"><X size={20} /></button></div>
             <div className="p-6 md:p-8">
               <p className="text-sm text-gray-500 mb-6 text-center">Bu odada geçmişte konaklayan müşteriler, giriş-çıkış tarihleri, uygulanan aylık kira bedelleri ve depoya ait görsel arşivler aşağıda listelenmiştir.</p>
               <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[60vh] overflow-y-auto">
                 <table className="w-full text-left text-sm text-gray-600 min-w-[900px]">
                    <thead className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-700 sticky top-0">
                      <tr><th className="p-3 border-r border-gray-200">Müşteri Adı Soyadı</th><th className="p-3 border-r border-gray-200 text-center">Giriş Tarihi</th><th className="p-3 border-r border-gray-200 text-center">Çıkış Tarihi</th><th className="p-3 border-r border-gray-200 text-center">Kaldığı Süre</th><th className="p-3 border-r border-gray-200 text-center">Aylık Kira</th><th className="p-3 border-r border-gray-200 text-center">Nakliye İşlemi</th><th className="p-3 border-r border-gray-200 text-center">Çıkış Görseli</th><th className="p-3 border-r border-gray-200 text-center">Arşiv Belgeleri</th><th className="p-3 border-r border-gray-200 text-center">Tutanak / Depo Foto.</th><th className="p-3 text-center">Durum</th></tr>
                    </thead>
                    <tbody>
                      {(selectedRoomDetail?.history || []).length > 0 ? selectedRoomDetail.history.map((h, i) => (
                        <tr key={i} className="bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="p-3 border-r border-gray-200 font-medium text-gray-800">{h.customerName}</td>
                          <td className="p-3 border-r border-gray-200 text-center">{h.entryDate}</td>
                          <td className="p-3 border-r border-gray-200 text-center">{h.exitDate}</td>
                          <td className="p-3 border-r border-gray-200 text-center font-medium">{h.duration}</td>
                          <td className="p-3 border-r border-gray-200 text-center text-red-500 font-bold">{h.monthlyFee} TL</td>
                          <td className="p-3 border-r border-gray-200 text-center">{h.exitBy === 'sembol' ? <span className="bg-teal-50 text-teal-600 px-2 py-1 rounded text-xs font-bold border border-teal-200">Sembol Nakliyat</span> : <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border border-slate-200">Kendisi</span>}</td>
                          <td className="p-3 border-r border-gray-200 text-center">{h.photo ? <a href={h.photo} target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-800 underline text-xs font-semibold">Görseli İncele</a> : <span className="text-gray-400 text-xs">Yok</span>}</td>
                          <td className="p-3 border-r border-gray-200 text-center text-xs">
                            <div className="flex flex-col gap-1 items-center">
                              {h.entryPhoto ? <a href={h.entryPhoto} target="_blank" rel="noreferrer" className="text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1"><Check size={12}/> Oda İlk Giriş Görseli</a> : <span className="text-gray-400">Oda İlk Giriş Görseli Yok</span>}
                              {h.entryExitHistory && h.entryExitHistory.length > 0 && <span className="text-indigo-600 font-medium">{h.entryExitHistory.length} Giriş-Çıkış Kaydı</span>}
                            </div>
                          </td>
                          {/* YENİ: Çıkış tutanağı & depo fotoğrafı — görüntüle ve (yetkisi olan) sonradan ekle/güncelle */}
                          <td className="p-3 border-r border-gray-200 text-center text-xs">
                            <div className="flex flex-col gap-1 items-center">
                              {h.tutanak ? <a href={h.tutanak} target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-800 underline font-semibold flex items-center gap-1"><FileTextIcon size={12}/> Tutanak</a> : <span className="text-gray-400">Tutanak Yok</span>}
                              {h.depoPhoto ? <a href={h.depoPhoto} target="_blank" rel="noreferrer" className="text-teal-600 hover:text-teal-800 underline font-semibold flex items-center gap-1"><Camera size={12}/> Depo Fotoğrafı</a> : <span className="text-gray-400">Depo Fotoğrafı Yok</span>}
                              {/* Buton YALNIZCA 'Odadan Çıkış Yapma' yetkisi olan personele görünür */}
                              {hasPerm('actions', 'action-depodan-cikis') && (
                                <button type="button" onClick={() => { setExitDocsTarget({ index: i, historyId: h.id ?? null, customerName: h.customerName, roomName: h.roomName || selectedRoomDetail?.name, tutanak: h.tutanak || null, depoPhoto: h.depoPhoto || null }); setExitDocsUploadMenu(null); setIsExitDocsModalOpen(true); }} className="mt-1 inline-flex items-center gap-1 bg-cyan-500 hover:bg-cyan-600 text-white px-2 py-1 rounded-md text-[10px] font-bold transition-colors">
                                  <Plus size={11}/> {(h.tutanak || h.depoPhoto) ? 'Güncelle' : 'Ekle'}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium">{h.status}</span></td>
                        </tr>
                      )) : (<tr><td colSpan="10" className="p-8 text-center text-gray-400">Bu oda için henüz geçmiş bir kayıt bulunmamaktadır.</td></tr>)}
                    </tbody>
                 </table>
               </div>
               <div className="mt-8 flex justify-end"><button onClick={() => setIsRoomHistoryModalOpen(false)} className="bg-gray-800 hover:bg-gray-900 text-white px-8 py-2.5 rounded-lg text-sm font-medium transition-colors">Kapat</button></div>
             </div>
          </div>
        </div>
      )}

      {/* YENİ EKLENEN: ÇIKIŞ SONRASI TUTANAK / DEPO FOTOĞRAFI EKLEME MODALI
          Oda geçmişi tablosundaki "Ekle/Güncelle" butonuyla açılır. Yalnızca 'Odadan Çıkış Yapma'
          yetkisi olan personel açabilir; tamamlanmış bir çıkış kaydına sonradan belge ekler/günceller. */}
      {isExitDocsModalOpen && exitDocsTarget && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center relative">
               <h3 className="text-lg font-bold text-cyan-600 mx-auto w-full text-center flex items-center justify-center gap-2"><FileTextIcon size={18}/> Çıkış Tutanağı & Depo Fotoğrafı</h3>
               <button onClick={() => { setIsExitDocsModalOpen(false); setExitDocsTarget(null); }} className="absolute right-5 text-gray-400 hover:text-red-500"><X size={20} /></button>
             </div>
             <div className="p-6">
               <p className="text-xs text-gray-500 mb-5 text-center"><b>{exitDocsTarget.customerName || '-'}</b> müşterisinin <b>{exitDocsTarget.roomName || '-'}</b> odasına ait çıkış kaydına imzalı tutanağı ve güncel depo fotoğrafını ekleyin.</p>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 {/* Tutanak yükleme */}
                 <div className="relative flex flex-col gap-1.5">
                   <label className="text-[10px] font-bold text-gray-500 uppercase">Çıkış Tutanağı</label>
                   <button type="button" onClick={() => setExitDocsUploadMenu(exitDocsUploadMenu === 'tutanak' ? null : 'tutanak')} className="border-2 border-dashed border-cyan-200 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-cyan-50 cursor-pointer h-24 w-full transition-colors">
                     {exitDocsTarget.tutanak ? (<div className="text-green-600 font-bold flex items-center gap-1"><Check size={16}/> Eklendi</div>) : (<><FileTextIcon size={16} className="text-gray-400 mb-1"/><span className="text-[10px] text-gray-500 font-bold">Yükle</span></>)}
                   </button>
                   {exitDocsUploadMenu === 'tutanak' && (
                     <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                       <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer border-b border-gray-100">
                         <Upload size={15} className="text-cyan-500"/> Şimdi Çek
                         <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setExitDocsTarget(prev => ({...prev, tutanak: url})); } setExitDocsUploadMenu(null); }}/>
                       </label>
                       <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer">
                         <FileTextIcon size={15} className="text-cyan-500"/> Galeri / Dosyadan Seç
                         <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setExitDocsTarget(prev => ({...prev, tutanak: url})); } setExitDocsUploadMenu(null); }}/>
                       </label>
                     </div>
                   )}
                 </div>
                 {/* Depo fotoğrafı yükleme */}
                 <div className="relative flex flex-col gap-1.5">
                   <label className="text-[10px] font-bold text-gray-500 uppercase">Depo Fotoğrafı</label>
                   <button type="button" onClick={() => setExitDocsUploadMenu(exitDocsUploadMenu === 'depo' ? null : 'depo')} className="border-2 border-dashed border-cyan-200 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-cyan-50 cursor-pointer h-24 w-full transition-colors">
                     {exitDocsTarget.depoPhoto ? (<div className="text-green-600 font-bold flex items-center gap-1"><Check size={16}/> Eklendi</div>) : (<><Camera size={16} className="text-gray-400 mb-1"/><span className="text-[10px] text-gray-500 font-bold">Yükle</span></>)}
                   </button>
                   {exitDocsUploadMenu === 'depo' && (
                     <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                       <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer border-b border-gray-100">
                         <Upload size={15} className="text-cyan-500"/> Şimdi Çek
                         <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setExitDocsTarget(prev => ({...prev, depoPhoto: url})); } setExitDocsUploadMenu(null); }}/>
                       </label>
                       <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-cyan-50 cursor-pointer">
                         <ImageIcon size={15} className="text-cyan-500"/> Galeriden Seç
                         <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setExitDocsTarget(prev => ({...prev, depoPhoto: url})); } setExitDocsUploadMenu(null); }}/>
                       </label>
                     </div>
                   )}
                 </div>
               </div>
               <div className="mt-6 flex justify-end gap-3">
                 <button onClick={() => { setIsExitDocsModalOpen(false); setExitDocsTarget(null); }} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg text-sm font-bold">İptal</button>
                 <button onClick={handleSaveExitDocs} className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><Check size={16}/> Kaydet</button>
               </div>
             </div>
          </div>
        </div>
      )}

      {isEntryExitModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in max-h-[90vh] flex flex-col">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0 relative"><h3 className="text-xl font-bold text-indigo-600 mx-auto w-full text-center">Giriş-Çıkış İşlemi</h3><button onClick={() => setIsEntryExitModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-red-500"><X size={20} /></button></div>
             <div className="p-6 overflow-y-auto">
                <p className="text-xs text-gray-500 mb-6 text-center">Müşteri depoya giriş-çıkış yaptığında yeni mühür numarasını ve güncel görselleri kaydedin. Bu işlem müşterinin cari hesabına otomatik olarak <strong>200 TL + %20 KDV</strong> tutarında mühür ücreti yansıtacaktır.</p>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Yeni Mühür Numarası (Zorunlu)</label>
                    <input type="text" value={entryExitData.newSealNo} onChange={(e) => setEntryExitData({...entryExitData, newSealNo: e.target.value.toUpperCase()})} placeholder="Örn: YM-54321" className="border-2 border-indigo-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-bold text-slate-700 uppercase" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div className="flex flex-col gap-1.5 relative">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Giriş-Çıkış Tutanağı</label>
                      <button type="button" onClick={() => setEntryExitUploadMenu(entryExitUploadMenu === 'protocol' ? null : 'protocol')} className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 cursor-pointer h-24 w-full">
                        {entryExitData.protocolPhoto ? (<div className="text-indigo-500 font-bold flex items-center gap-1"><Check size={16}/> Eklendi</div>) : (<><Upload size={16} className="text-gray-400 mb-1"/><span className="text-[10px] text-gray-500 font-bold">Yükle</span></>)}
                      </button>
                      {entryExitUploadMenu === 'protocol' && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                          <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-indigo-50 cursor-pointer border-b border-gray-100">
                            <Upload size={15} className="text-indigo-500"/> Şimdi Çek
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEntryExitData(prev => ({...prev, protocolPhoto: url})); } setEntryExitUploadMenu(null); }}/>
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-indigo-50 cursor-pointer border-b border-gray-100">
                            <FileTextIcon size={15} className="text-indigo-500"/> Galeriden Seç
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEntryExitData(prev => ({...prev, protocolPhoto: url})); } setEntryExitUploadMenu(null); }}/>
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-indigo-50 cursor-pointer">
                            <FileTextIcon size={15} className="text-indigo-500"/> Dosyadan Seç
                            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEntryExitData(prev => ({...prev, protocolPhoto: url})); } setEntryExitUploadMenu(null); }}/>
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 relative">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Depo Son Hali</label>
                      <button type="button" onClick={() => setEntryExitUploadMenu(entryExitUploadMenu === 'final' ? null : 'final')} className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 cursor-pointer h-24 w-full">
                        {entryExitData.finalPhoto ? (<div className="text-indigo-500 font-bold flex items-center gap-1"><Check size={16}/> Eklendi</div>) : (<><Upload size={16} className="text-gray-400 mb-1"/><span className="text-[10px] text-gray-500 font-bold">Yükle</span></>)}
                      </button>
                      {entryExitUploadMenu === 'final' && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                          <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-indigo-50 cursor-pointer border-b border-gray-100">
                            <Upload size={15} className="text-indigo-500"/> Şimdi Çek
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEntryExitData(prev => ({...prev, finalPhoto: url})); } setEntryExitUploadMenu(null); }}/>
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-indigo-50 cursor-pointer border-b border-gray-100">
                            <FileTextIcon size={15} className="text-indigo-500"/> Galeriden Seç
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEntryExitData(prev => ({...prev, finalPhoto: url})); } setEntryExitUploadMenu(null); }}/>
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-indigo-50 cursor-pointer">
                            <FileTextIcon size={15} className="text-indigo-500"/> Dosyadan Seç
                            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file){ const url = await uploadImageToServer(file); setEntryExitData(prev => ({...prev, finalPhoto: url})); } setEntryExitUploadMenu(null); }}/>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* YENİ EKLENEN: Giriş-Çıkış Tutanağını yazdır / WhatsApp ile paylaş */}
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                      <button type="button" onClick={handlePrintEntryExitProtocol} className="flex-1 border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                        <FileTextIcon size={16}/> Tutanağı Yazdır
                      </button>
                      <button type="button" onClick={handleShareEntryExitProtocol} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
                        <MessageCircle size={16}/> WhatsApp'tan Paylaş
                      </button>
                  </div>
                  {/* YENİ EKLENEN: İmzalı Giriş-Çıkış Tutanağını cari Sözleşmeler'e yükle */}
                  <label className="mt-2 flex items-center justify-center gap-1.5 border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg py-2 text-xs font-bold cursor-pointer transition-colors">
                    <Upload size={14}/> İmzalı Tutanağı Cariye Yükle
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; const room = rooms.find(r => r.id === selectedRoomId); const cust = customers.find(c => c.name === room?.customerName); if(file && cust) await uploadSignedDocToCustomer(cust.id, file, 'Giriş-Çıkış Tutanağı'); e.target.value=''; }}/>
                  </label>

                  {/* YENİ: 2) GİRİŞ-ÇIKIŞ VEKALETİ — müşteri adına başka birine giriş-çıkış yetkisi veren tutanak */}
                  <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                      <div className="flex items-center gap-2 mb-1">
                          <Shield size={16} className="text-violet-500"/>
                          <h4 className="text-sm font-bold text-violet-700">2) Giriş-Çıkış Vekaleti</h4>
                      </div>
                      <p className="text-[11px] text-gray-500 mb-3">Müşterinin, deposuna başka birinin (vekilin) giriş-çıkış yapmasına izin verdiği vekalet tutanağı. Yetki verilecek kişinin bilgilerini girin.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Yetki Verilecek Kişi (Ad Soyad)</label>
                              <input type="text" value={vekaletData.vekilName} onChange={(e) => setVekaletData({...vekaletData, vekilName: e.target.value})} placeholder="Örn: AHMET YILMAZ" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 font-medium text-slate-700" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">T.C. Kimlik No</label>
                              <input type="text" value={vekaletData.vekilTc} onChange={(e) => setVekaletData({...vekaletData, vekilTc: e.target.value})} placeholder="Örn: 12345678901" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 font-medium text-slate-700" />
                          </div>
                      </div>
                      <div className="mt-3 flex flex-col sm:flex-row gap-2">
                          <button type="button" onClick={() => handlePrintVekalet('giris-cikis')} disabled={!vekaletData.vekilName || !vekaletData.vekilTc} className="flex-1 border-2 border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                              <FileTextIcon size={16}/> Vekalet Yazdır
                          </button>
                          <button type="button" onClick={() => handleShareVekalet('giris-cikis')} disabled={!vekaletData.vekilName || !vekaletData.vekilTc} className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
                              <MessageCircle size={16}/> WhatsApp'tan Gönder
                          </button>
                      </div>
                  </div>
                </div>
                <div className="mt-8 pt-4 border-t border-gray-100 flex justify-end gap-3">
                  <button onClick={() => setIsEntryExitModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-bold">İptal</button>
                  <button onClick={handleEntryExitSave} disabled={!entryExitData.newSealNo} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2"><Check size={16}/> Kaydet & Ücreti Yansıt</button>
                </div>
             </div>
          </div>
        </div>
      )}



      {/* Depo/Blok fotoğraf görüntüleyici → src/depo.jsx içine taşındı. */}
      {/* YENİ EKLENEN: ODA DETAYINDAN RANDEVU OLUŞTUR MODALI */}
      {roomAppointmentModal && selectedRoomDetail && (
        <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4" onClick={() => setRoomAppointmentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in" onClick={(e) => e.stopPropagation()}>
             <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-emerald-50">
                <h3 className="text-base font-bold text-emerald-800 flex items-center gap-2"><Calendar size={18}/> Randevu Oluştur — {selectedRoomDetail.name}</h3>
                <button onClick={() => setRoomAppointmentModal(false)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded-full shadow-sm"><X size={20}/></button>
             </div>
             <div className="p-5 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 font-medium">
                   <b>{selectedRoomDetail.customerName}</b> için randevu. Kaydedince takvime eklenir ve WhatsApp mesajı hazırlanır.
                </div>
                <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-600">Randevu Tarihi</label>
                   <input type="date" value={roomAppointmentData.date} onChange={(e) => setRoomAppointmentData({...roomAppointmentData, date: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 font-medium" />
                </div>
                <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-600">Saat Aralığı</label>
                   <select value={roomAppointmentData.time} onChange={(e) => setRoomAppointmentData({...roomAppointmentData, time: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 font-medium bg-white">
                      {['09:00 - 10:00','10:00 - 11:00','11:00 - 12:00','12:00 - 13:00','13:00 - 14:00','14:00 - 15:00','15:00 - 16:00','16:00 - 17:00','17:00 - 18:00'].map(t => <option key={t} value={t}>{t}</option>)}
                   </select>
                </div>
                <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-600">İşlem Türü</label>
                   <div className="flex flex-col gap-2">
                      <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${roomAppointmentData.purpose === 'giris-cikis' ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                         <input type="radio" name="roomApptPurpose" checked={roomAppointmentData.purpose === 'giris-cikis'} onChange={() => setRoomAppointmentData({...roomAppointmentData, purpose: 'giris-cikis'})} className="w-4 h-4 accent-blue-500" />
                         <span className="text-sm font-bold text-blue-700">Odadan Giriş - Çıkış</span>
                      </label>
                      <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${roomAppointmentData.purpose === 'tahliye' ? 'border-red-400 bg-red-50/40' : 'border-gray-200 bg-white hover:border-red-200'}`}>
                         <input type="radio" name="roomApptPurpose" checked={roomAppointmentData.purpose === 'tahliye'} onChange={() => setRoomAppointmentData({...roomAppointmentData, purpose: 'tahliye'})} className="w-4 h-4 accent-red-500" />
                         <span className="text-sm font-bold text-red-700">Odadan Tüm Eşyaları Kendisi Çıkaracak</span>
                      </label>
                   </div>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                   <button onClick={() => { handleSaveRoomAppointment(); handleShareRoomAppointmentWhatsApp(); setRoomAppointmentModal(false); }} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/30">
                      <MessageCircle size={16}/> Randevu Oluştur ve WhatsApp'tan Paylaş
                   </button>
                   <button onClick={() => { handleSaveRoomAppointment(); setRoomAppointmentModal(false); }} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 text-sm font-bold transition-colors">
                      Sadece Takvime Kaydet
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* YENİ EKLENEN: ODA FOTOĞRAFI GÖRÜNTÜLEME / YÜKLEME PENCERESİ (göz ikonu) */}
      {roomPhotoViewer !== null && (() => {
          const oda = rooms.find(r => r.id === roomPhotoViewer);
          if (!oda) return null;
          return (
            <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4" onClick={() => setRoomPhotoViewer(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in" onClick={(e) => e.stopPropagation()}>
                 <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Eye size={18} className="text-[#1bc5bd]"/> {oda.name} — Oda Fotoğrafı</h3>
                    <button onClick={() => setRoomPhotoViewer(null)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded-full shadow-sm"><X size={20}/></button>
                 </div>
                 <div className="p-5">
                    {oda.roomListPhoto ? (
                       <div className="flex flex-col gap-4">
                          <a href={oda.roomListPhoto} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                             <img src={oda.roomListPhoto} alt={`${oda.name} fotoğrafı`} className="w-full max-h-80 object-contain bg-gray-50" />
                          </a>
                          <div className="flex gap-2">
                             <label className="flex-1 bg-[#1bc5bd] hover:bg-teal-500 text-white rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                                <RefreshCcw size={15}/> Değiştir
                                <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files[0]; if(f) await handleSetRoomListPhoto(oda.id, f); e.target.value=''; }}/>
                             </label>
                             <button onClick={async () => { await handleRemoveRoomListPhoto(oda.id); }} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors border border-red-100">
                                <Trash2 size={15}/> Sil
                             </button>
                          </div>
                       </div>
                    ) : (
                       <div className="flex flex-col items-center gap-4 py-4">
                          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center"><Box size={28} className="text-gray-300"/></div>
                          <p className="text-sm text-gray-500 font-medium text-center">Bu oda için henüz bir fotoğraf eklenmemiş.</p>
                          <label className="w-full bg-[#1bc5bd] hover:bg-teal-500 text-white rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
                             <Upload size={16}/> Oda Fotoğrafı Ekle
                             <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files[0]; if(f) await handleSetRoomListPhoto(oda.id, f); e.target.value=''; }}/>
                          </label>
                       </div>
                    )}
                 </div>
              </div>
            </div>
          );
      })()}


      {/* YENİ EKLENEN: BİLGİLENDİRME GÖNDER MODALI (3 tür) */}
      {infoNotifyModal && (() => {
          const c = getInfoNotifyContent(infoNotifyModal);
          const room = selectedRoomDetail;
          const customer = customers.find(cu => cu.name === room?.customerName);
          return (
            <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={() => setInfoNotifyModal(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col animate-in fade-in zoom-in" onClick={(e) => e.stopPropagation()}>
                 <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50 rounded-t-2xl">
                     <div>
                        <h3 className="text-base font-bold text-blue-700 flex items-center gap-2"><MessageCircle size={18}/> {c.title}</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">{customer?.name || room?.customerName} • Oda {room?.name}</p>
                     </div>
                     <button onClick={() => setInfoNotifyModal(null)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
                 </div>
                 <div className="p-5 overflow-y-auto flex-1">
                     <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">{c.heading}</h4>
                     <ol className="list-decimal pl-5 space-y-2 text-[13px] text-gray-700">
                         {c.rules.map((r, i) => <li key={i}>{r}</li>)}
                     </ol>
                 </div>
                 <div className="p-4 border-t border-gray-100 flex flex-col gap-2">
                     <div className="flex flex-col sm:flex-row gap-2">
                         <button onClick={() => handlePrintInfoNotify(infoNotifyModal)} className="flex-1 border-2 border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"><FileTextIcon size={15}/> Yazdır</button>
                         <button onClick={() => handleShareInfoNotify(infoNotifyModal)} className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"><MessageCircle size={15}/> WhatsApp'tan Paylaş</button>
                     </div>
                     <label className="flex items-center justify-center gap-1.5 border-2 border-dashed border-violet-200 text-violet-700 hover:bg-violet-50 rounded-lg py-2 text-xs font-bold cursor-pointer transition-colors">
                         <Upload size={14}/> İmzalı Bilgilendirmeyi Cariye Yükle
                         <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(file && customer) await uploadSignedDocToCustomer(customer.id, file, c.title); else if(file && !customer) alert('Yüklemek için kayıtlı müşteri gerekli.'); e.target.value=''; }}/>
                     </label>
                 </div>
              </div>
            </div>
          );
      })()}





      {/* MESAJ GÖNDERİM TERCİHİ MODALI */}
      {messageModalData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                 <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">Mesaj Gönderim Yolu</h3>
                 <button onClick={() => setMessageModalData(null)}><X size={20} className="text-gray-500 hover:text-red-500"/></button>
             </div>
             <div className="p-6">
                <p className="text-sm text-gray-600 mb-6 text-center">Oluşturulan otomatik mesajı müşteriye hangi kanaldan göndermek istersiniz?</p>
                <div className="flex flex-col gap-3">
                  <button onClick={() => handleSendMessage('whatsapp')} className="bg-emerald-500 hover:bg-emerald-600 text-white w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-sm shadow-emerald-500/30">
                    <MessageCircle size={20} /> WhatsApp İle Gönder
                  </button>
                  <button onClick={() => handleSendMessage('sms')} className="bg-blue-500 hover:bg-blue-600 text-white w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors shadow-sm shadow-blue-500/30">
                    <Phone size={20} /> SMS İle Gönder
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}









      {/* YENİ: HIZLI MÜŞTERİ EKLEME MODALI — kiralama ekranından açılır.
          İçerik, "Yeni Müşteri Ekle" sayfasıyla BİREBİR AYNI formdur (renderNewCustomerForm).
          Kaydedilince sayfaya gitmez: modal kapanır ve yeni müşteri kiralama formunda otomatik seçilir. */}
      {isQuickCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[85] flex items-center justify-center p-4" onClick={() => setIsQuickCustomerModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in" onClick={(e) => e.stopPropagation()}>
             <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-teal-50 rounded-t-2xl sticky top-0 z-10">
                 <h3 className="text-lg font-bold text-teal-700 flex items-center gap-2"><Plus size={18} strokeWidth={3} /> Hızlı Müşteri Ekle</h3>
                 <button onClick={() => setIsQuickCustomerModalOpen(false)} className="text-teal-400 hover:text-teal-600 bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-2 sm:p-4">
                {renderNewCustomerForm()}
             </div>
          </div>
        </div>
      )}

      {/* Oda Boyutu Bul modalı → src/depo.jsx içine taşındı. */}

      {/* YENİ EKLENEN: GÖSTERGE PANELİ DETAY PENCERESİ */}
      {dashboardDetail && (() => {
          const range = dashboardDetailFilter;
          let items = [];
          if (dashboardDetail.type === 'newCustomers') {
              items = customers
                  .filter(c => inDashboardRange(parseAnyDate(c.createdAt), range))
                  .map(c => ({ id: c.id, name: c.name, sub: `No: ${c.customerNo}`, date: c.createdAt, dateObj: parseAnyDate(c.createdAt), customerId: c.id, roomId: null }));
          } else if (dashboardDetail.type === 'exitedCustomers' || dashboardDetail.type === 'exitedRooms') {
              items = collectExits(range).map(x => {
                  const cust = customers.find(c => c.name === x.customerName);
                  const rm = rooms.find(r => r.name === x.roomName);
                  return { id: `${x.roomName}-${x.date}`, name: x.name, sub: `${x.roomName} • Çıkış`, date: x.date, dateObj: x.dateObj, customerId: cust?.id || null, roomId: rm?.id || null };
              });
          } else if (dashboardDetail.type === 'enteredRooms') {
              items = collectEntries(range).map(x => {
                  const cust = customers.find(c => c.name === x.customerName);
                  const rm = rooms.find(r => r.name === x.roomName);
                  return { id: `${x.roomName}-${x.date}`, name: x.name, sub: `${x.roomName} • Giriş`, date: x.date, dateObj: x.dateObj, customerId: cust?.id || null, roomId: rm?.id || null };
              });
          } else if (dashboardDetail.type === 'overdueMovements') {
              // GÜNCELLENDİ: Yalnızca "Giriş-Çıkış İşlemi" butonuyla eklenen hareketler (ilk kayıt sayılmaz)
              items = collectEntryExitOps(range).map(x => {
                  const cust = customers.find(c => c.name === x.customerName);
                  const rm = rooms.find(r => r.name === x.roomName);
                  return { id: `${x.roomName}-${x.date}-${x.id}`, name: x.name, sub: `${x.roomName} • Giriş-Çıkış İşlemi`, date: x.date, dateObj: x.dateObj, customerId: cust?.id || null, roomId: rm?.id || null };
              });
          }
          // En yeniden en eskiye sırala
          items.sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0));
          const totalCount = items.length;
          const shownItems = dashboardDetailShowAll ? items : items.slice(0, 20);

          return (
            <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={() => setDashboardDetail(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in fade-in zoom-in" onClick={(e) => e.stopPropagation()}>
                 <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 bg-slate-50 rounded-t-2xl">
                     <div>
                        <h3 className="text-lg font-bold text-slate-800">{dashboardDetail.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Toplam {totalCount} kayıt • en yeniden en eskiye</p>
                     </div>
                     <div className="flex items-start gap-2">
                        {/* Filtreler sağ üst köşede */}
                        <div className="flex flex-wrap gap-1.5 justify-end">
                            {[['today','Bugün'],['yesterday','Dün'],['week','Bu Hafta'],['month','Bu Ay'],['year','Bu Sene'],['all','Tüm Zamanlar']].map(([val,label]) => (
                                <button key={val} onClick={() => { setDashboardDetailFilter(val); setDashboardDetailShowAll(false); }} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${range === val ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{label}</button>
                            ))}
                        </div>
                        <button onClick={() => setDashboardDetail(null)} className="text-gray-400 hover:text-gray-600 bg-white p-1 rounded-full shadow-sm shrink-0"><X size={20} /></button>
                     </div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4">
                     {shownItems.length === 0 ? (
                         <div className="text-center py-12 text-gray-500 font-medium text-sm">Bu dönemde kayıt bulunamadı.</div>
                     ) : (
                         <div className="flex flex-col gap-2">
                             {shownItems.map(item => (
                                 <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-gray-100">
                                     <div className="min-w-0">
                                         <div className="font-bold text-sm text-gray-800">{item.name}</div>
                                         <div className="text-[11px] text-gray-400 mt-0.5">{item.sub} • {item.date}</div>
                                     </div>
                                     <div className="flex items-center gap-2 shrink-0">
                                         {['overdueMovements','newCustomers','exitedCustomers'].includes(dashboardDetail.type) && item.customerId && (
                                             <button onClick={() => { setActiveMenu('tum-musteriler'); setSelectedCustomerId(item.customerId); setDashboardDetail(null); }} className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                                 {/* DÜZELTİLDİ: activeMenu değişmediği için cari ekranı açılmıyordu — menü de müşteri ekranına geçirilir */}
                                                 <Wallet size={13}/> Carisine Git
                                             </button>
                                         )}
                                         {item.roomId && (
                                             <button onClick={() => {
                                                 // DÜZELTİLDİ: Sadece oda ID set edilmesi yetmiyordu; şube ve blok da seçilmeli
                                                 // yoksa depo ekranı odaya kadar açılmıyordu. Konum kimlikleri collectEntries/Exits'ten gelir.
                                                 const room = rooms.find(r => String(r.id) === String(item.roomId));
                                                 const wId = item.warehouseId ?? blocks.find(b => b.id === room?.blockId)?.warehouseId;
                                                 const bId = item.blockId ?? room?.blockId;
                                                 setActiveMenu('depo');
                                                 setSelectedWarehouseId(wId);
                                                 setSelectedBlockId(bId);
                                                 setSelectedRoomId(item.roomId);
                                                 setSelectedCustomerId(null);
                                                 setDashboardDetail(null);
                                             }} className="flex items-center gap-1 bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                                 <Box size={13}/> Odasına Git
                                             </button>
                                         )}
                                     </div>
                                 </div>
                             ))}
                         </div>
                     )}
                 </div>
                 {totalCount > 20 && (
                     <div className="p-4 border-t border-gray-100 text-center">
                         <button onClick={() => setDashboardDetailShowAll(!dashboardDetailShowAll)} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">
                             {dashboardDetailShowAll ? 'Daha Az Göster' : `Tümünü Göster (${totalCount})`}
                         </button>
                     </div>
                 )}
              </div>
            </div>
          );
      })()}


      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in flex flex-col">
              <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10 rounded-t-2xl">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><UserCog size={20} className="text-[#1bc5bd]"/> Profil Ayarları</h3>
                  <button onClick={() => setIsProfileModalOpen(false)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded-full shadow-sm border border-gray-200"><X size={20} /></button>
              </div>
              <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8">
                  {/* Sol Taraf: Avatar */}
                  <div className="flex flex-col items-center gap-4 w-full md:w-1/3">
                      <div className="relative group cursor-pointer">
                          <div className="w-32 h-32 rounded-full border-4 border-gray-100 shadow-md overflow-hidden bg-gray-50 flex items-center justify-center">
                              {currentUserProfile.avatar ? (
                                  <img src={currentUserProfile.avatar} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                  <span className="text-4xl font-bold text-gray-300">
                                      {currentUserProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                  </span>
                              )}
                          </div>
                          <label className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                              <Upload size={24} className="mb-1" />
                              <span className="text-xs font-bold mt-1">Fotoğraf<br/>Değiştir</span>
<input type="file" accept="image/*" className="hidden" onChange={async (e) => {
    const file = e.target.files[0];
    if(file) {
        const url = await uploadImageToServer(file);
        setCurrentUserProfile({...currentUserProfile, avatar: url});
    }
}}/>
                          </label>
                      </div>
                      <div className="text-center">
                          <h4 className="font-bold text-gray-800 text-lg">{currentUserProfile.name}</h4>
                          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mt-1 inline-block border border-orange-200">{currentUserProfile.role}</span>
                      </div>
                  </div>
                  
                  {/* Sağ Taraf: Form */}
                  <div className="flex-1 flex flex-col gap-6">
                      <div className="flex flex-col gap-4">
                          <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Kişisel Bilgiler</h4>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-semibold text-gray-600">Ad Soyad</label>
                              <input type="text" value={currentUserProfile.name} onChange={(e) => setCurrentUserProfile({...currentUserProfile, name: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-semibold text-gray-600">E-Posta Adresi</label>
                                  <input type="email" value={currentUserProfile.email} onChange={(e) => setCurrentUserProfile({...currentUserProfile, email: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-semibold text-gray-600">Telefon Numarası</label>
                                  <input type="text" value={currentUserProfile.phone} onChange={(e) => setCurrentUserProfile({...currentUserProfile, phone: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" />
                              </div>
                          </div>
                      </div>

                      <div className="flex flex-col gap-4 mt-2">
                          <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">Giriş ve Şifre Ayarları</h4>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-semibold text-gray-600">Mevcut Şifre</label>
                              <input type="password" placeholder="••••••••" value={currentUserProfile.oldPassword} onChange={(e) => setCurrentUserProfile({...currentUserProfile, oldPassword: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700 bg-gray-50 focus:bg-white transition-colors" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-semibold text-gray-600">Yeni Şifre</label>
                                  <input type="password" placeholder="Yeni şifreniz" value={currentUserProfile.newPassword} onChange={(e) => setCurrentUserProfile({...currentUserProfile, newPassword: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700 bg-gray-50 focus:bg-white transition-colors" />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-semibold text-gray-600">Yeni Şifre (Tekrar)</label>
                                  <input type="password" placeholder="Şifrenizi doğrulayın" value={currentUserProfile.confirmPassword} onChange={(e) => setCurrentUserProfile({...currentUserProfile, confirmPassword: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 font-medium text-slate-700 bg-gray-50 focus:bg-white transition-colors" />
                              </div>
                          </div>
                          {currentUserProfile.newPassword && currentUserProfile.newPassword !== currentUserProfile.confirmPassword && (
                              <p className="text-[10px] text-red-500 font-bold bg-red-50 p-2 rounded border border-red-100 mt-1">Girdiğiniz yeni şifreler birbiriyle eşleşmiyor. Lütfen kontrol ediniz.</p>
                          )}
                      </div>
                      
                      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                          <button onClick={() => setIsProfileModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-bold transition-colors">İptal Et</button>
                          <button onClick={() => {
                              if(currentUserProfile.newPassword && currentUserProfile.newPassword !== currentUserProfile.confirmPassword) return;
                              
                              // Profilden yapılan değişikliği sistem kullanıcılarına senkronize et
                              setSystemUsers(prev => prev.map(u => u.id === currentUserProfile.id ? {...currentUserProfile, password: currentUserProfile.newPassword || u.password} : u));
                              setCurrentUserProfile({...currentUserProfile, oldPassword: '', newPassword: '', confirmPassword: ''});
                              setIsProfileModalOpen(false);
                          }} disabled={currentUserProfile.newPassword && currentUserProfile.newPassword !== currentUserProfile.confirmPassword} className="bg-[#1bc5bd] hover:bg-teal-500 disabled:opacity-50 text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-sm shadow-teal-500/30 transition-colors flex items-center gap-2"><Check size={16} strokeWidth={3}/> Bilgileri Kaydet</button>
                      </div>
                  </div>
              </div>
           </div>
        </div>
      )}

      {/* YENİ KULLANICI EKLEME MODALI */}
      {/* YENİ EKLENEN: PANEL KULLANICISI SİLME ONAY PENCERESİ
          Sil butonuna basınca doğrudan silmek yerine bu "emin misiniz?" penceresi açılır. */}
      {userToDeleteId !== null && (() => {
        const _u = systemUsers.find(u => String(u.id) === String(userToDeleteId));
        return (
          <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in overflow-hidden">
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4"><Trash2 size={30}/></div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Kullanıcıyı Sil</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-6"><b>{_u?.name || 'Bu kullanıcı'}</b> adlı panel kullanıcısını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.</p>
                <div className="flex gap-2 w-full">
                  <button onClick={() => setUserToDeleteId(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors">Vazgeç</button>
                  <button onClick={() => { const id = userToDeleteId; setUserToDeleteId(null); handleDeleteSystemUser(id); }} className="flex-1 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5"><Trash2 size={16}/> Evet, Sil</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in flex flex-col">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-indigo-800 flex items-center gap-2"><UserCog size={20} /> Yeni Panel Kullanıcısı Ekle</h3>
                 <button onClick={() => setIsAddUserModalOpen(false)} className="text-indigo-400 hover:text-indigo-600 bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-6 md:p-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Ad Soyad (Zorunlu)</label>
                        <input type="text" value={newUserData.name} onChange={(e) => setNewUserData({...newUserData, name: e.target.value})} placeholder="Örn: Ali Yılmaz" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Kullanıcı Adı (Zorunlu)</label>
                        <input type="text" value={newUserData.username} onChange={(e) => setNewUserData({...newUserData, username: e.target.value})} placeholder="Sisteme giriş adı" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Şifre (Zorunlu)</label>
                        <input type="text" value={newUserData.password} onChange={(e) => setNewUserData({...newUserData, password: e.target.value})} placeholder="Giriş şifresi" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Sistem Yetkisi (Rol)</label>
                        <select value={newUserData.role} onChange={(e) => setNewUserData({...newUserData, role: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-bold text-slate-700 cursor-pointer bg-white">
                            {/* YENİ: Yönetici rolü listede yoksa otomatik eklenir */}
                            {!userRoles.some(r => r.name === 'Yönetici') && <option value="Yönetici">Yönetici</option>}
                            {userRoles.map(r => (
                                <option key={r.id} value={r.name}>{r.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Telefon Numarası</label>
                        <input type="text" value={newUserData.phone} onChange={(e) => setNewUserData({...newUserData, phone: e.target.value})} placeholder="İsteğe Bağlı" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">E-Posta Adresi</label>
                        <input type="email" value={newUserData.email} onChange={(e) => setNewUserData({...newUserData, email: e.target.value})} placeholder="İsteğe Bağlı" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700" />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                    <button onClick={() => setIsAddUserModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors">İptal</button>
                    <button onClick={handleAddSystemUser} disabled={!newUserData.username || !newUserData.password || !newUserData.name} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-sm shadow-indigo-500/30 transition-colors flex items-center gap-2"><Check size={16} strokeWidth={3}/> Kullanıcıyı Kaydet</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* KULLANICI DÜZENLEME MODALI */}
      {isEditUserModalOpen && editUserData && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in flex flex-col">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-blue-800 flex items-center gap-2"><UserCog size={20} /> Panel Kullanıcısını Düzenle</h3>
                 <button onClick={() => setIsEditUserModalOpen(false)} className="text-blue-400 hover:text-blue-600 bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-6 md:p-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Ad Soyad (Zorunlu)</label>
                        <input type="text" value={editUserData.name} onChange={(e) => setEditUserData({...editUserData, name: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Kullanıcı Adı (Zorunlu)</label>
                        <input type="text" value={editUserData.username} onChange={(e) => setEditUserData({...editUserData, username: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Şifre (Zorunlu)</label>
                        <input type="text" value={editUserData.password} onChange={(e) => setEditUserData({...editUserData, password: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Sistem Yetkisi (Rol)</label>
                        <select value={editUserData.role} onChange={(e) => setEditUserData({...editUserData, role: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 font-bold text-slate-700 cursor-pointer bg-white">
                            {/* YENİ: Yönetici rolü listede yoksa otomatik eklenir */}
                            {!userRoles.some(r => r.name === 'Yönetici') && <option value="Yönetici">Yönetici</option>}
                            {userRoles.map(r => (
                                <option key={r.id} value={r.name}>{r.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Telefon Numarası</label>
                        <input type="text" value={editUserData.phone} onChange={(e) => setEditUserData({...editUserData, phone: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 font-medium text-slate-700" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">E-Posta Adresi</label>
                        <input type="email" value={editUserData.email} onChange={(e) => setEditUserData({...editUserData, email: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 font-medium text-slate-700" />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                    <button onClick={() => setIsEditUserModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors">İptal</button>
                    <button onClick={handleUpdateSystemUser} disabled={!editUserData.username || !editUserData.password || !editUserData.name} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-sm shadow-blue-500/30 transition-colors flex items-center gap-2"><Check size={16} strokeWidth={3}/> Değişiklikleri Kaydet</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Depo/Blok/Oda silme onay modalları → src/depo.jsx içine taşındı. */}

      {/* TÜM CARİLERİ (DEPO ÖDEMELERİ) GÜNCELLEME MODALI */}
      {isUpdateAllModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in overflow-hidden flex flex-col">
             {isUpdatingAll ? (
                 <div className="p-10 flex flex-col items-center justify-center text-center h-[350px]">
                     <RefreshCcw size={56} className="text-indigo-500 animate-spin mb-6" />
                     <h3 className="text-xl font-bold text-gray-800 mb-2">Hesaplar Güncelleniyor...</h3>
                     <p className="text-sm text-gray-500 leading-relaxed font-medium">Tüm odaların giriş tarihleri ve bugünün tarihi karşılaştırılarak cari hesaplar yeniden hesaplanıyor.</p>
                 </div>
             ) : (
                 <>
                     <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600 flex justify-center">
                         <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
                             <Check size={40} className="text-indigo-600" strokeWidth={3} />
                         </div>
                     </div>
                     <div className="p-8 text-center">
                         <h3 className="text-2xl font-black text-gray-800 mb-2 tracking-tight">Güncelleme Tamamlandı!</h3>
                         <p className="text-sm text-gray-500 mb-6 font-medium">Sistemdeki tüm müşterilerin cari hesapları bugünün tarihi olan <strong>{updateAllStats?.date}</strong> baz alınarak tarandı ve güncel kiralar hesaplara işlendi.</p>
                         
                         <div className="bg-slate-50 rounded-2xl p-4 border border-gray-100 mb-8 flex gap-4 shadow-inner">
                             <div className="flex-1">
                                 <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Borçlu Müşteri</div>
                                 <div className="text-2xl font-black text-slate-700">{updateAllStats?.affectedCustomers}</div>
                             </div>
                             <div className="w-px bg-gray-200"></div>
                             <div className="flex-1">
                                 <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Toplam Alacak</div>
                                 <div className="text-xl font-black text-red-500 mt-1">{updateAllStats?.totalUnpaid?.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</div>
                             </div>
                         </div>
                         
                         <button onClick={() => setIsUpdateAllModalOpen(false)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3.5 rounded-xl font-bold transition-colors">Pencereyi Kapat</button>
                     </div>
                 </>
             )}
          </div>
        </div>
)}

{/* RANDEVU DÜZENLEME MODALI */}
      {isEditApptModalOpen && editApptData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 lg:p-8">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-indigo-50 rounded-t-2xl">
                    <h3 className="text-lg font-bold text-indigo-700 flex items-center gap-2"><Edit size={20} /> Randevuyu Düzenle</h3>
                    <button onClick={() => setIsEditApptModalOpen(false)} className="text-indigo-400 hover:text-indigo-600 transition-colors bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
                </div>
                <div className="p-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Müşteri Ad Soyad</label>
                            <input type="text" value={editApptData?.customerName || ''} onChange={(e) => setEditApptData({...editApptData, customerName: e.target.value.toUpperCase()})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Telefon Numarası</label>
                            <input type="text" value={editApptData?.customerPhone || ''} onChange={(e) => setEditApptData({...editApptData, customerPhone: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-600">Randevu Tarihi</label>
                                <input type="date" value={editApptData?.date || ''} onChange={(e) => setEditApptData({...editApptData, date: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-600">Saat Aralığı</label>
                                <select value={editApptData?.time || ''} onChange={(e) => setEditApptData({...editApptData, time: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white cursor-pointer">
                                   <option value="09:00 - 10:00">09:00 - 10:00</option>
                                   <option value="10:00 - 11:00">10:00 - 11:00</option>
                                   <option value="11:00 - 12:00">11:00 - 12:00</option>
                                   <option value="12:00 - 13:00">12:00 - 13:00</option>
                                   <option value="13:00 - 14:00">13:00 - 14:00</option>
                                   <option value="14:00 - 15:00">14:00 - 15:00</option>
                                   <option value="15:00 - 16:00">15:00 - 16:00</option>
                                   <option value="16:00 - 17:00">16:00 - 17:00</option>
                                   <option value="17:00 - 18:00">17:00 - 18:00</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Randevu Amacı</label>
                            <select value={editApptData?.purpose || ''} onChange={(e) => setEditApptData({...editApptData, purpose: e.target.value})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white cursor-pointer">
                                <option value="giris-cikis">Depoya Giriş - Çıkış</option>
                                <option value="ziyaret">Yeni Müşteri Adayı Ziyaret</option>
                                <option value="esya-getirme">Yeni Müşteri Eşya Getiriyor</option>
                                <option value="tahliye">Depodan Tüm Eşyaları Kendisi Çıkartıcak</option>
                                <option value="temizlik">Depo Temizlik</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-600">Depo Şubesi Seçimi</label>
                            <select value={editApptData?.warehouseId || ''} onChange={(e) => setEditApptData({...editApptData, warehouseId: parseInt(e.target.value) || ''})} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 font-medium text-slate-700 bg-white cursor-pointer">
                                <option value="">Şube Seçiniz</option>
                                {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    </div>
<div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6">
                        <button onClick={() => setIsEditApptModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-bold transition-colors text-sm">İptal</button>
                        <button onClick={handleSaveEditAppointment} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/30"><Check size={18}/> Değişiklikleri Kaydet</button>
                    </div>
                </div>
            </div>
        </div>
      )}



    </div>
  );
}
