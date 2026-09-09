import { useState } from 'react';
import { doc, setDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import {
  AlertCircle,
  UserPlus,   // YENİ: "Kaydeden" rozeti ikonu
  ArrowLeft,
  Bell,
  Box,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  Download,
  Edit,
  Eye,
  FileText as FileTextIcon,
  FolderOpen,
  History,
  MessageCircle,
  Phone,
  Plus,
  Settings,
  Shield,
  Trash2,
  TrendingUp,
  Upload,
  UserCog,
  Users,
  Wallet,
  X
} from 'lucide-react';

// Arşiv dosyası açma yardımcısı (App.jsx ile aynı, bağımsız kopya)
const openArchiveFile = (fileUrl) => {
    if (!fileUrl) return;
    try {
        if (String(fileUrl).startsWith('data:')) {
            // data:[mime];base64,xxxx → Blob
            const parts = String(fileUrl).split(',');
            const meta = parts[0] || '';
            const mimeMatch = meta.match(/data:([^;]+)/);
            const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
            const isBase64 = meta.includes('base64');
            const dataStr = parts.slice(1).join(',');
            let blob;
            if (isBase64) {
                const byteChars = atob(dataStr);
                const byteNums = new Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
                blob = new Blob([new Uint8Array(byteNums)], { type: mime });
            } else {
                blob = new Blob([decodeURIComponent(dataStr)], { type: mime });
            }
            const blobUrl = URL.createObjectURL(blob);
            const w = window.open(blobUrl, '_blank');
            // Blob URL'yi bir süre sonra serbest bırak (sekme yüklendikten sonra)
            setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch(e){} }, 60000);
            if (!w) alert('Tarayıcı yeni sekme açmayı engelledi. Lütfen pop-up iznini verin.');
        } else {
            window.open(fileUrl, '_blank');
        }
    } catch (e) {
        console.error('Belge açma hatası:', e);
        window.open(fileUrl, '_blank');
    }
};

// Dinamik olarak SheetJS (Excel) kütüphanesini yükleyen yardımcı fonksiyon (App.jsx ile aynı, bağımsız kopya)
const loadXLSXLibrary = () => {
  return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve(window.XLSX);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = reject;
      document.head.appendChild(script);
  });
};

// Yazdırma/PDF dosya adı yardımcıları (App.jsx ile aynı, bağımsız kopya)
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

// Arama/karşılaştırma normalizasyon yardımcısı (App.jsx ile aynı, bağımsız kopya)
const normalizeStr = (str) => {
    if (!str) return '';
    return str.toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
};

// Türkiye'nin 81 ili (App.jsx ile aynı, bağımsız kopya)
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

// ============================================================================
// MÜŞTERİ (MÜŞTERİ LİSTESİ / MÜŞTERİ DETAY) BİLEŞENİ
// App.jsx içindeki "Yeni Müşteri Ekle" (form içeriği renderNewCustomerForm
// prop'u ile App.jsx'te kalır), "Müşteri Listesi" ve "Cari Hesap Profili"
// (Müşteri Detay) ekranları, ilgili modallar ve müşteri işlemlerini yapan
// kodlar buraya taşındı. Finans (Finans Rapor) state'leri ve mantığı App.jsx
// içinde kalır; bu bileşen ihtiyaç duyduğu paylaşılan veriyi ve yardımcı
// fonksiyonları props üzerinden alır.
// ============================================================================
export default function Musteri(props) {
  const {
    activeMenu, setActiveMenu,
    selectedCustomerId, setSelectedCustomerId,
    customers, setCustomers,
    rooms, setRooms,
    blocks,
    setSelectedWarehouseId, setSelectedBlockId, setSelectedRoomId,
    db, firebaseUser, appId,
    checkActionPerm, logActivity, archiveDeletedItem, uploadImageToServer,
    currentUserProfile,
    pendingCollections, setPendingCollections,
    sembolePaymentAktar, sembolePaymentSil,
    hasActivePaymentOnDate, hasActiveSameAmountOnDate,
    getCustomerLedger,
    handleOpenMessageModal,
    setReminderModal,
    collectionRates,
    contractSettings,
    getRoomLatestFee, getRoomLatestGrossFee,
    parseDateLocal,
    displayRoomM3,
    isAvukat,
    inDashboardRange, parseAnyDate,
    handleNavClick,
    renderNewCustomerForm,
  } = props;

  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  // YENİ EKLENEN: Müşteri Listesi birleşik sayfa filtreleri
  const [custRoomFilter, setCustRoomFilter] = useState('all'); // 'all' | 'withRoom' | 'noRoom'
  const [custTimeFilter, setCustTimeFilter] = useState('all'); // 'today'|'week'|'month'|'year'|'all'
  const [custRoomDropdownOpen, setCustRoomDropdownOpen] = useState(false);
  const [custTimeDropdownOpen, setCustTimeDropdownOpen] = useState(false);

  // --- YENİ EKLENEN STATE'LER (Fatura ve Silme Modalları İçin) ---
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ invoiceNo: '', amount: '', date: new Date().toISOString().split('T')[0], file: null });

  // YENİ EKLENEN: Müşteri Sözleşmeleri (cari profildeki "Sözleşmeler" bölümü)
  const [isContractsModalOpen, setIsContractsModalOpen] = useState(false);
  const [newContract, setNewContract] = useState({ label: 'Sözleşme', date: new Date().toISOString().split('T')[0], file: null });

  // YENİ EKLENEN: Arşiv/Ek Belgeler bölümü sekmesi (fatura / sözleşme / oda fotoğrafı / ek belge)
  const [archiveTab, setArchiveTab] = useState('faturalar');

  const [isDeleteCustomerModalOpen, setIsDeleteCustomerModalOpen] = useState(false);
  const [customerToDeleteId, setCustomerToDeleteId] = useState(null);
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
  const [editCustomerData, setEditCustomerData] = useState(null);

  // --- YENİ: CARİ DÜZENLEME STATE'LERİ ---
  const [isEditLedgerListModalOpen, setIsEditLedgerListModalOpen] = useState(false);
  const [editingLedgerItem, setEditingLedgerItem] = useState(null);

  // --- MANUEL CARİ İŞLEM STATE'LERİ ---
  const [isAddDebtModalOpen, setIsAddDebtModalOpen] = useState(false);
  const [newDebtData, setNewDebtData] = useState({ desc: '', amount: '', date: new Date().toISOString().split('T')[0], hasKdv: true });
  
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  const [newPaymentData, setNewPaymentData] = useState({ amount: '', date: new Date().toISOString().split('T')[0], note: '', isCreditCard: false, netAmount: '' });

  const [ledgerFilterYear, setLedgerFilterYear] = useState(new Date().getFullYear().toString());

  // YENİ EKLENEN: E-Fatura/IBAN geçiş bilgilendirme mesaj menüsü (cari profildeki müşteri id'si)
  const [kdvInfoMenuFor, setKdvInfoMenuFor] = useState(null);

  const handlePrintLedger = (customer, ledgerTransactions, finalBalance, periodStr = 'all') => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const tableRows = ledgerTransactions.map(tx => `
          <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${tx.dateStr}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${tx.desc}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #dc2626; font-weight: bold;">${tx.debt > 0 ? (tx.baseDebt || 0).toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0}) + ' TL' : '-'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #f97316; font-weight: bold;">${tx.debt > 0 ? (tx.kdvDebt || 0).toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0}) + ' TL' : '-'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #16a34a; font-weight: bold;">${tx.credit > 0 ? tx.credit.toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0}) + ' TL' : '-'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #1f2937;">${tx.balance.toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL</td>
          </tr>
      `).join('');

      setPdfFileName(customer?.name || fileName);
      setPdfFileName(customer.name);
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
              <title>${sanitizePdfName(customer.name)}</title>
              <style>
                  @page { size: A4 portrait; margin: 20mm;  @top-left{content:""} @top-center{content:""} @top-right{content:""} @bottom-left{content:""} @bottom-center{content:""} @bottom-right{content:""}}
                  body { font-family: 'Arial', sans-serif; padding: 0; color: #333; margin: 0; }
                  .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1bc5bd; padding-bottom: 15px; }
                  .header h2 { margin: 0 0 10px 0; color: #1f2937; font-size: 24px; }
                  .info-box { display: flex; justify-content: space-between; background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0; }
                  .info-box div { font-size: 14px; }
                  .info-box strong { color: #475569; display: inline-block; width: 120px; }
                  table { width: 100%; border-collapse: collapse; font-size: 13px; }
                  th { background-color: #f1f5f9; padding: 12px 10px; text-align: left; color: #475569; font-weight: bold; border-bottom: 2px solid #cbd5e1; }
                  .total-row td { background-color: #f8fafc; padding: 15px 10px; border-top: 2px solid #cbd5e1; font-weight: bold; font-size: 14px; }
                  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100pt; font-weight: bold; color: rgba(0, 0, 0, 0.03); z-index: -1; }
              </style>
          </head>
          <body>
              <div class="watermark">Depoevim</div>
              <div class="header">
                  <h2>MÜŞTERİ CARİ HESAP DÖKÜMÜ (EKSTRE) ${periodStr !== 'all' ? `- ${periodStr} YILI` : ''}</h2>
              </div>
              <div class="info-box">
                  <div>
                      <div style="margin-bottom: 8px;"><strong>Müşteri Adı:</strong> ${customer.name}</div>
                      <div style="margin-bottom: 8px;"><strong>Müşteri No:</strong> ${customer.customerNo}</div>
                      <div><strong>Telefon:</strong> ${customer.phone}</div>
                  </div>
                  <div style="text-align: right;">
                      <div style="margin-bottom: 8px;"><strong>Belge Tarihi:</strong> ${new Date().toLocaleDateString('tr-TR')}</div>
                      <div><strong>Güncel Bakiye:</strong> <span style="color: ${finalBalance > 0 ? '#dc2626' : '#16a34a'}; font-weight: bold; font-size: 16px;">${finalBalance.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</span></div>
                  </div>
              </div>
              <table>
                  <thead>
                      <tr>
                          <th>Tarih</th>
                          <th>İşlem Açıklaması</th>
                          <th style="text-align: right;">Borç (Tahakkuk)</th>
                          <th style="text-align: right;">+ KDV %20 Tutarı</th>
                          <th style="text-align: right;">Alacak (Ödenen)</th>
                          <th style="text-align: right;">Bakiye</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${tableRows}
                      <tr class="total-row">
                          <td colspan="2" style="text-align: right; color: #475569;">DÖNEM TOPLAMI / GÜNCEL BAKİYE:</td>
                          <td style="text-align: right; color: #dc2626;">${ledgerTransactions.reduce((sum, tx) => sum + (tx.baseDebt || 0), 0).toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL</td>
                          <td style="text-align: right; color: #f97316;">${ledgerTransactions.reduce((sum, tx) => sum + (tx.kdvDebt || 0), 0).toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL</td>
                          <td style="text-align: right; color: #16a34a;">${ledgerTransactions.reduce((sum, tx) => sum + tx.credit, 0).toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL</td>
                          <td style="text-align: right; color: ${finalBalance > 0 ? '#dc2626' : '#16a34a'}; font-size: 16px;">${finalBalance.toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL</td>
                      </tr>
                  </tbody>
              </table>
          </body>
          </html>
      `);
      iframe.contentWindow.document.close();

      setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
      }, 500);
  };

const handleAddExtraDocument = async (e, customerId) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      const customerToUpdate = customers.find(c => c.id === customerId);
      if (!customerToUpdate || !db || !firebaseUser) return;

      const promises = files.map(file => {
          return new Promise(async (resolve) => {
              const url = await uploadImageToServer(file);
              resolve({ id: Date.now() + Math.random(), url: url, name: file.name });
          });
      });

      const newFiles = await Promise.all(promises);
      const updatedDocs = [...(customerToUpdate.extraDocuments || []), ...newFiles];

      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerId)), { extraDocuments: updatedDocs }, { merge: true });
      } catch (err) { console.error(err); }
      e.target.value = '';
  };

  const handleDeleteExtraDocument = async (customerId, docId) => {
      if(!checkActionPerm('action-arsiv-sil')) return;
      if (!window.confirm('Bu belgeyi silmek istediğinize emin misiniz?')) return;
      const customerToUpdate = customers.find(c => c.id === customerId);
      if (!customerToUpdate) return;
      const updatedDocs = (customerToUpdate.extraDocuments || []).filter(d => d.id !== docId);
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerId)), { extraDocuments: updatedDocs }, { merge: true });
          } catch (err) { console.error(err); }
      } else {
          setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, extraDocuments: updatedDocs } : c));
      }
  };

  // YENİ EKLENEN: Cari profildeki Faturalar sekmesinden fatura silme (önizleme + canlı)
  const handleDeleteInvoiceFromArchive = async (customerId, invId) => {
      if(!checkActionPerm('action-arsiv-sil')) return;
      if (!window.confirm('Bu faturayı arşivden silmek istediğinize emin misiniz?')) return;
      const customerToUpdate = customers.find(c => c.id === customerId);
      if (!customerToUpdate) return;
      const updatedInvoices = (customerToUpdate.invoices || []).filter(i => i.id !== invId);
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerId)), { invoices: updatedInvoices }, { merge: true });
          } catch (e) { console.error("Fatura Silme Hatası:", e); }
      } else {
          setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, invoices: updatedInvoices } : c));
      }
  };

  // YENİ EKLENEN: Bir müşterinin tüm oda fotoğraflarını (giriş görseli + giriş/çıkış arşivi) toplar
  const getCustomerRoomPhotos = (customerName) => {
      const photos = [];
      rooms.filter(r => r.customerName === customerName).forEach(r => {
          if (r.entryPhoto) photos.push({ key: `entry-${r.id}`, roomId: r.id, url: r.entryPhoto, label: `${r.name} - Oda İlk Giriş`, kind: 'entryPhoto', mediaType: r.entryMediaType || 'image' });
          // YENİ: Birden fazla giriş görseli desteği — ek görseller de galeride listelenir
          (r.entryPhotos || []).forEach((ep, i) => { if (ep && ep.url) photos.push({ key: `entryx-${r.id}-${i}`, roomId: r.id, url: ep.url, label: `${r.name} - Oda İlk Giriş (Ek ${i + 1})`, kind: 'entryPhotoExtra', extraIndex: i, mediaType: ep.mediaType || 'image' }); });
          (r.entryExitHistory || []).forEach((h, i) => {
              if (h.protocolPhoto) photos.push({ key: `hp-${r.id}-${i}`, roomId: r.id, url: h.protocolPhoto, label: `${r.name} - Tutanak (${h.date || ''})`, kind: 'history', histId: h.id, field: 'protocolPhoto' });
              if (h.finalPhoto) photos.push({ key: `hf-${r.id}-${i}`, roomId: r.id, url: h.finalPhoto, label: `${r.name} - Son Hal (${h.date || ''})`, kind: 'history', histId: h.id, field: 'finalPhoto' });
          });
      });
      return photos;
  };

  // Oda fotoğrafını odadan kaldır (önizleme + canlı)
  const handleDeleteRoomPhoto = async (photo) => {
      if(!checkActionPerm('action-arsiv-sil')) return;
      if (!window.confirm('Bu fotoğrafı silmek istediğinize emin misiniz?')) return;
      const room = rooms.find(r => r.id === photo.roomId);
      if (!room) return;
      let update = {};
      if (photo.kind === 'entryPhoto') {
          update = { entryPhoto: null };
      } else if (photo.kind === 'entryPhotoExtra') {
          // YENİ: Ek giriş görsellerinden (entryPhotos) sadece seçilen silinir
          update = { entryPhotos: (room.entryPhotos || []).filter((_, i) => i !== photo.extraIndex) };
      } else if (photo.kind === 'history') {
          const newHist = (room.entryExitHistory || []).map(h => h.id === photo.histId ? { ...h, [photo.field]: null } : h);
          update = { entryExitHistory: newHist };
      }
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(room.id)), update, { merge: true }); } catch(e){ console.error(e); }
      } else {
          setRooms(prev => prev.map(r => r.id === room.id ? { ...r, ...update } : r));
      }
  };

const handleDeleteCustomer = async (customerId) => {
      logActivity('Müşteri Silme', 'Bir müşteri kalıcı olarak silindi.');
      const customerToDelete = customers.find(c => c.id === customerId);
      // YENİ: Silinen müşteriyi geri yükleme çöp kutusuna arşivle
      if (customerToDelete) await archiveDeletedItem('Müşteri', 'customers', customerToDelete, customerToDelete.name);
      
      if (db && firebaseUser) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customerId)));
              
              // Müşterinin odalarını da eşzamanlı olarak boşalt
              if (customerToDelete) {
                  const custRooms = rooms.filter(r => r.customerName === customerToDelete.name);
                  for (const r of custRooms) {
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(r.id)), {
                          customerName: null, phone: null, tc: null, paidMonths: []
                      }, { merge: true });
                  }
              }
          } catch (e) { console.error("Firebase Silme Hatası:", e); }
      }
      setIsDeleteCustomerModalOpen(false);
      if (selectedCustomerId === customerId) {
          setSelectedCustomerId(null);
      }
      setCustomerToDeleteId(null);
  };

const handleUpdateCustomer = async () => {
      if (!editCustomerData.name) return;
      const newName = editCustomerData.name.toUpperCase();
      const oldCustomer = customers.find(c => c.id === editCustomerData.id);
      
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(editCustomerData.id)), {
                  ...editCustomerData,
                  name: newName
              }, { merge: true });

              // İsim değiştiyse odalardaki ismi de otomatik güncelle
              if (oldCustomer && oldCustomer.name !== newName) {
                  const custRooms = rooms.filter(r => r.customerName === oldCustomer.name);
                  for (const r of custRooms) {
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(r.id)), {
                          customerName: newName
                      }, { merge: true });
                  }
              }
          } catch (e) { console.error("Firebase Güncelleme Hatası:", e); }
      }
      
      setIsEditCustomerModalOpen(false);
      setEditCustomerData(null);
  };

const handleDeleteLedgerItem = async (txId) => {
      if(!checkActionPerm('action-cari-sil')) return;
      if (!window.confirm('Bu cari hareketi/borcu silmek istediğinize emin misiniz? Bu işlem cari hesabı etkiler.')) return;
      logActivity('Cari Hareket Silme', 'Bir cari hareket silindi.');
    const customerToUpdate = customers.find(c => c.id === selectedCustomerId);
    
    if (customerToUpdate) {
        let updatePayload = {};

        if (txId.startsWith('debt-extra-')) {
            const debtId = Number(txId.replace('debt-extra-', ''));
            updatePayload = { extraDebts: (customerToUpdate.extraDebts || []).filter(d => Number(d.id) !== debtId) };
        } else if (txId.startsWith('credit-global-')) {
            const payId = Number(txId.replace('credit-global-', ''));
            updatePayload = { payments: (customerToUpdate.payments || []).filter(p => Number(p.id) !== payId) };

            // === SEMBOL KÖPRÜSÜ: Cari ekstreden silinen tahsilat ALBARAKA defterinden de kaldırılır ===
            sembolePaymentSil(customerToUpdate, payId);
        } else {
            updatePayload = { 
                ledgerOverrides: [
                    ...(customerToUpdate.ledgerOverrides || []).filter(o => o.txId !== txId),
                    { txId, isDeleted: true }
                ]
            };
        }

        // YENİ: Yerel state ANINDA güncellenir — silmenin hemen ardından aynı güne
        // yeni tahsilat girilebilsin (Firestore snapshot gecikmesi hataya yol açmasın).
        setCustomers(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, ...updatePayload } : c));

        if (db && firebaseUser) {
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), updatePayload, { merge: true });
            } catch(e) { console.error("Cari Silme Hatası:", e); }
        }
    }
  };

const handleSaveLedgerEdit = async () => {
    if (!editingLedgerItem) return;
    const { id: txId, editDate, editDesc, editAmount, isDebt } = editingLedgerItem;
    const newAmount = Number(editAmount);
    const customerToUpdate = customers.find(c => c.id === selectedCustomerId);

    if (customerToUpdate && db && firebaseUser) {
        try {
            let updatePayload = {};

if (txId.startsWith('debt-extra-')) {
                const debtId = Number(txId.replace('debt-extra-', ''));
                const updatedDebts = (customerToUpdate.extraDebts || []).map(d => Number(d.id) === debtId ? { ...d, date: editDate, desc: editDesc, amount: newAmount } : d);
                updatePayload = { extraDebts: updatedDebts };
            } else if (txId.startsWith('credit-global-')) {
                const payId = Number(txId.replace('credit-global-', ''));
                
                const existingPayments = customerToUpdate.payments || [];
                // Aynı gün kontrolü (Kendisi hariç) — YENİ: silinmiş/taşınmış tahsilatlar sayılmaz
                if (hasActivePaymentOnDate(customerToUpdate, editDate, payId)) {
                    alert("HATA: Bu müşterinin carisinde seçili tarihe ait zaten bir tahsilat bulunmaktadır. Aynı güne başka tahsilat kaydedilemez.");
                    return;
                }

                const updatedPayments = existingPayments.map(p => Number(p.id) === payId ? { ...p, date: editDate, note: editDesc, amount: newAmount } : p);
                updatePayload = { payments: updatedPayments };

                // === SEMBOL KÖPRÜSÜ: Düzenlenen tahsilat, sabit kimlik sayesinde Sembol'deki
                // MEVCUT kaydın tutar/tarih/notunu günceller (yeni satır açılmaz) ===
                const duzenlenenLedgerOdeme = updatedPayments.find(p => Number(p.id) === payId);
                if (duzenlenenLedgerOdeme) sembolePaymentAktar(customerToUpdate, duzenlenenLedgerOdeme);
            } else {
                // Otomatik hesaplanan oda kiralarına müdahale (Override)
                const updatedOverrides = [
                    ...(customerToUpdate.ledgerOverrides || []).filter(o => o.txId !== txId),
                    { txId, desc: editDesc, date: editDate, debt: isDebt ? newAmount : 0, credit: !isDebt ? newAmount : 0 }
                ];
                updatePayload = { ledgerOverrides: updatedOverrides };
            }

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), updatePayload, { merge: true });
        } catch(e) { console.error("Cari Düzenleme Kayıt Hatası:", e); }
    }
    setEditingLedgerItem(null);
  };

const handleManualAddDebt = async () => {
    if (!newDebtData.desc || !newDebtData.amount) return;
    const baseAmount = Number(newDebtData.amount);
    const finalAmount = newDebtData.hasKdv ? baseAmount * 1.20 : baseAmount;
    
    const newDebt = {
        id: Date.now(),
        type: 'manual_debt',
        date: newDebtData.date,
        amount: finalAmount,
        hasKdv: newDebtData.hasKdv,
        desc: newDebtData.desc
    };

    const customerToUpdate = customers.find(c => c.id === selectedCustomerId);

    // DÜZELTİLDİ: Kayıt artık YEREL listeye de anında ekleniyor. Eskiden yalnızca
    // Firebase'e yazılıyordu; oturum sorunu olan cihazlarda veya önizleme modunda
    // borç hiç görünmüyor, kullanıcı "eklenmedi" sanıp tekrar tekrar giriyordu.
    if (customerToUpdate) {
        setCustomers(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, extraDebts: [...(c.extraDebts || []), newDebt] } : c));
    }

    if (customerToUpdate && db && firebaseUser) {
        try {
            const existingDebts = customerToUpdate.extraDebts || [];
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), {
                extraDebts: [...existingDebts, newDebt]
            }, { merge: true });
        } catch(e) { console.error("Manuel Borç Ekleme Hatası:", e); }
    }
    logActivity('Cari Borç', `${customerToUpdate?.name || ''} carisine borç eklendi: ${newDebtData.desc} (${finalAmount.toLocaleString('tr-TR')} TL)`);

    setIsAddDebtModalOpen(false);
    setNewDebtData({ desc: '', amount: '', date: new Date().toISOString().split('T')[0], hasKdv: true });
  };

const handleManualAddPayment = async () => {
    if (!newPaymentData.amount) return;
    
    const customerToUpdate = customers.find(c => c.id === selectedCustomerId);
    if (customerToUpdate) {
        const existingPayments = customerToUpdate.payments || [];
        // YENİ: Aynı gün FARKLI tutar serbest. Yalnızca aynı gün + aynı tutar tekrarında engellemek yerine,
        // kayıt "onay bekliyor" (soluk) olarak eklenir ve caride Onayla / Sil / Askıya Gönder ile yönetilir.
        const _dupAmount = Number(newPaymentData.amount);
        const isSameDaySameAmount = hasActiveSameAmountOnDate(customerToUpdate, newPaymentData.date, _dupAmount);
        if (isSameDaySameAmount) {
            alert(`UYARI: Bu müşteride ${newPaymentData.date} tarihinde AYNI TUTARDA (${_dupAmount.toLocaleString('tr-TR')} ₺) bir tahsilat zaten var.\n\nKayıt caride SOLUK olarak eklendi ve bakiyeye şimdilik işlenmedi. Cari ekstreden "Onayla" (işle), "Sil" (kaldır) veya "Askıya Gönder" ile yönetebilirsiniz.`);
        }

        // YENİ EKLENEN: Kredi kartıyla tahsilat — cariye BRÜT (müşteriden alınan) tutar işlenir,
        // net (kesintili) tutar rapor için ayrıca saklanır; açıklamaya "Kredi Kartıyla Ödeme" eklenir.
        const isCC = newPaymentData.isCreditCard;
        const gross = Number(newPaymentData.amount);
        const net = isCC && newPaymentData.netAmount ? Number(newPaymentData.netAmount) : gross;
        const ccNote = isCC ? `Kredi Kartıyla Ödeme${newPaymentData.note ? ' - ' + newPaymentData.note : ''}` : newPaymentData.note;

        const newPayment = {
            id: Number(Date.now().toString() + Math.floor(Math.random() * 1000).toString()),
            createdAt: Date.now(), // YENİ: sisteme giriş anı (güvenilir sıralama için)
            needsConfirm: isSameDaySameAmount, // YENİ: aynı gün+aynı tutar ise onay bekler (soluk, bakiyeye işlenmez)
            amount: gross,
            date: newPaymentData.date,
            note: ccNote,
            paymentMethod: isCC ? 'creditCard' : 'normal',
            grossAmount: gross,
            netAmount: net
        };
        
        if (db && firebaseUser) {
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), {
                    payments: [...existingPayments, newPayment]
                }, { merge: true });

                // === SEMBOL KÖPRÜSÜ: Manuel girilen tahsilat ALBARAKA defterine gider ===
                // (needsConfirm=true olan soluk kayıtlar yardımcı fonksiyonda otomatik atlanır,
                //  onaylandığı anda handleConfirmPendingPayment üzerinden gönderilir)
                sembolePaymentAktar(customerToUpdate, newPayment);
            } catch(e) { console.error("Manuel Ödeme Ekleme Hatası:", e); }
        } else {
            setCustomers(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, payments: [...existingPayments, newPayment] } : c));
        }
    }

    setIsAddPaymentModalOpen(false);
    setNewPaymentData({ amount: '', date: new Date().toISOString().split('T')[0], note: '', isCreditCard: false, netAmount: '' });
  };

  // YENİ EKLENEN: Aynı gün + aynı tutarlı (onay bekleyen/soluk) tahsilat işlemleri
  // Onayla → kaydı kesinleştir: soluk kalkar, bakiyeye normal tahsilat olarak işlenir.
  const handleConfirmPendingPayment = async (payId) => {
      const cust = customers.find(c => c.id === selectedCustomerId);
      if (!cust) return;
      const updated = (cust.payments || []).map(p => Number(p.id) === Number(payId) ? { ...p, needsConfirm: false } : p);
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(cust.id)), { payments: updated }, { merge: true }); } catch (e) { console.error("Tahsilat Onaylama Hatası:", e); }
      } else {
          setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, payments: updated } : c));
      }

      // === SEMBOL KÖPRÜSÜ: Onaylanan tahsilat artık bakiyeye işlendi → ALBARAKA defterine gider ===
      const onaylananOdeme = updated.find(p => Number(p.id) === Number(payId));
      if (onaylananOdeme) sembolePaymentAktar(cust, onaylananOdeme);

      logActivity('Tahsilat Onayı', `${cust.name} - aynı gün/aynı tutar tahsilat onaylandı ve cariye işlendi.`);
  };

  // Sil → kaydı tamamen kaldır (hiç işlenmemiş gibi).
  const handleDeletePendingPayment = async (payId) => {
      if (!window.confirm('Bu tahsilat kaydını silmek istediğinize emin misiniz?')) return;
      const cust = customers.find(c => c.id === selectedCustomerId);
      if (!cust) return;
      const updated = (cust.payments || []).filter(p => Number(p.id) !== Number(payId));
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(cust.id)), { payments: updated }, { merge: true }); } catch (e) { console.error("Tahsilat Silme Hatası:", e); }
      } else {
          setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, payments: updated } : c));
      }
      // === SEMBOL KÖPRÜSÜ: Güvenlik için Sembol'deki olası karşılık da silinir ===
      // (Soluk kayıt hiç gönderilmediyse Sembol'de belge yoktur; olmayan belgeyi silmek sorun çıkarmaz)
      sembolePaymentSil(cust, payId);
      logActivity('Tahsilat Silme', `${cust.name} - onay bekleyen tahsilat kaydı kaldırıldı.`);
  };

  // Askıya Gönder → cariden çıkar, askıdaki (pendingCollections) işlemlere ekle.
  const handleSendPendingPaymentToAskida = async (payId) => {
      const cust = customers.find(c => c.id === selectedCustomerId);
      if (!cust) return;
      const pay = (cust.payments || []).find(p => Number(p.id) === Number(payId));
      if (!pay) return;
      const pendingRecord = { id: Date.now(), amount: Number(pay.amount), date: pay.date, note: pay.note || 'Cariden askıya alındı', customerName: cust.name };
      const updatedPayments = (cust.payments || []).filter(p => Number(p.id) !== Number(payId));
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pendingCollections', String(pendingRecord.id)), pendingRecord);
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(cust.id)), { payments: updatedPayments }, { merge: true });

              // === SEMBOL KÖPRÜSÜ: Ödeme carideyken Sembol'e gitmişse, askıya alındığı için kaldırılır ===
              sembolePaymentSil(cust, payId);
          } catch (e) { console.error("Tahsilat Askıya Gönderme Hatası:", e); }
      } else {
          setPendingCollections(prev => [...prev, pendingRecord]);
          setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, payments: updatedPayments } : c));
      }
      logActivity('Tahsilat Askıya Alma', `${cust.name} - tahsilat askıdaki işlemlere gönderildi.`);
  };

  // YENİ: Cari detayından kimlik belgesi (ön/arka yüz) fotoğrafı ekle-değiştir / sil.
  // side: 'front' | 'back'. file null ise siler. Önizleme + canlı uyumlu (yerel state anında güncellenir).
  const handleUpdateCustomerDocument = async (side, file) => {
      if (!selectedCustomerId) return;
      const fieldKey = side === 'back' ? 'documentPhotoBack' : 'documentPhotoFront';
      let url = null;
      if (file) {
          try { url = await uploadImageToServer(file); } catch (e) { console.error("Kimlik Yükleme Hatası:", e); return; }
      }
      // Ön yüzde eski tekil alan (documentPhoto) da tutarlı kalsın diye birlikte güncellenir
      const payload = side === 'front' ? { documentPhotoFront: url, documentPhoto: url } : { documentPhotoBack: url };
      setCustomers(prev => prev.map(c => String(c.id) === String(selectedCustomerId) ? { ...c, ...payload } : c));
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), payload, { merge: true });
          } catch (e) { console.error("Kimlik Güncelleme Hatası:", e); }
      }
  };

const handleAddInvoice = async () => {
      if (!newInvoice.date || !newInvoice.file || !selectedCustomerId) return;
      const inv = { id: Date.now(), ...newInvoice };
      const customerToUpdate = customers.find(c => c.id === selectedCustomerId);
      if (customerToUpdate && db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), {
                  invoices: [...(customerToUpdate.invoices || []), inv]
              }, { merge: true });
          } catch (e) { console.error("Fatura Ekleme Hatası:", e); }
      }
      setNewInvoice({ invoiceNo: '', amount: '', date: new Date().toISOString().split('T')[0], file: null });
  };

  const handleDeleteInvoice = async (invId) => {
      if (!window.confirm('Bu faturayı silmek istediğinize emin misiniz?')) return;
      const customerToUpdate = customers.find(c => c.id === selectedCustomerId);
      if (customerToUpdate && db && firebaseUser) {
          try {
              const updatedInvoices = (customerToUpdate.invoices || []).filter(i => i.id !== invId);
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), {
                  invoices: updatedInvoices
              }, { merge: true });
          } catch (e) { console.error("Fatura Silme Hatası:", e); }
      }
  };

  // Cari profildeki "Sözleşmeler" modalından manuel belge ekleme
  const handleAddContract = async () => {
      // YENİ: Birden fazla dosya (sayfa) seçilebilir; sınır yok. Her dosya sunucuya yüklenip URL olarak
      // (base64 yerine) kaydedilir; böylece hiçbir sayfa kaybolmaz ve Firestore boyut sınırına takılmaz.
      const files = (newContract.files && newContract.files.length) ? newContract.files : [];
      if (!newContract.date || files.length === 0 || !selectedCustomerId) return;
      const cust = customers.find(c => c.id === selectedCustomerId);
      const baseLabel = newContract.label || 'Sözleşme';
      try {
          const newRecords = [];
          for (let i = 0; i < files.length; i++) {
              const url = await uploadImageToServer(files[i]);
              if (!url) continue;
              newRecords.push({ id: Date.now() + i, label: files.length > 1 ? `${baseLabel} (${i + 1}. Sayfa)` : baseLabel, date: newContract.date, file: url, note: '' });
          }
          if (newRecords.length === 0) { alert('Dosya(lar) yüklenemedi, lütfen tekrar deneyin.'); return; }
          if (db && firebaseUser) {
              // DÜZELTME: arrayUnion ile atomik ekleme — önceki sözleşmeler/sayfalar EZİLMEZ, kaybolmaz.
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), { contracts: arrayUnion(...newRecords) }, { merge: true });
          } else {
              setCustomers(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, contracts: [...(c.contracts || []), ...newRecords] } : c));
          }
      } catch (e) { console.error("Sözleşme Ekleme Hatası:", e); }
      setNewContract({ label: 'Sözleşme', date: new Date().toISOString().split('T')[0], file: null, files: [] });
  };

  const handleDeleteContract = async (contractId) => {
      if(!checkActionPerm('action-arsiv-sil')) return;
      if (!window.confirm('Bu sözleşmeyi silmek istediğinize emin misiniz?')) return;
      const customerToUpdate = customers.find(c => c.id === selectedCustomerId);
      if (!customerToUpdate) return;
      const updated = (customerToUpdate.contracts || []).filter(c => c.id !== contractId);
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(selectedCustomerId)), { contracts: updated }, { merge: true });
          } catch (e) { console.error("Sözleşme Silme Hatası:", e); }
      } else {
          setCustomers(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, contracts: updated } : c));
      }
  };

  // YENİ: Kimlik Belgesi (Ön/Arka) düzenleme modu — kalem butonuyla açılır, Değiştir/Sil butonları o zaman görünür
  const [isEditingIdDocs, setIsEditingIdDocs] = useState(false);

  // --- YENİ EKLENEN: TOPLU MÜŞTERİ İÇE AKTARMA STATE'LERİ ---
  const [isCustomerUploading, setIsCustomerUploading] = useState(false);
  const [customerImportResult, setCustomerImportResult] = useState(null);


  const handleBulkCustomerUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setIsCustomerUploading(true);

      try {
          await loadXLSXLibrary();
const reader = new FileReader();
          reader.onload = async (event) => {
              try {
                  const data = new Uint8Array(event.target.result);
                  // Excel'deki tarihleri düzgün alabilmek için cellDates: true
                  const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
                  const firstSheetName = workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[firstSheetName];
                  const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                  
                  let importedCustomerCount = 0;
                  let updatedRoomCount = 0;

                  const newCustomers = [];
                  const roomUpdates = {};

                  // Satırları tarama (1. satırın başlık olduğu varsayılır, bu yüzden i=1)
                  for (let i = 1; i < rows.length; i++) {
                      const row = rows[i];
                      if (!row || row.length === 0) continue;

                      let nameRaw = '';
                      let phoneRaw = '';
                      let roomsRaw = [];
                      let validDate = new Date().toISOString().split('T')[0];
                      let maxRent = 0;

                      for (let j = 0; j < row.length; j++) {
                          const cell = row[j];
                          if (cell === undefined || cell === null || cell === '') continue;

                          // 1. Tarih Kontrolü (Date Objesi)
                          if (cell instanceof Date) {
                              validDate = cell.toISOString().split('T')[0];
                              continue;
                          }

                          const cellStr = String(cell).trim();
                          const cellUpper = cellStr.toUpperCase();

                          // 2. Oda Kontrolü (Olası boşluk ve tireleri temizleyerek eşleştirme)
                          const possibleRooms = cellUpper.split(/[,/]/).map(s => s.trim());
                          let foundRoomInCell = false;
                          possibleRooms.forEach(pr => {
                              const matchedRoom = rooms.find(r => r.name.toUpperCase().replace(/[\s-]/g, '') === pr.replace(/[\s-]/g, ''));
                              if (matchedRoom) {
                                  if (!roomsRaw.includes(matchedRoom.name)) roomsRaw.push(matchedRoom.name);
                                  foundRoomInCell = true;
                              }
                          });
                          if (foundRoomInCell) continue;

                          // Tarih Kontrolü (String formatında - DD.MM.YYYY)
                          const trDateMatch = cellStr.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
                          if (trDateMatch) {
                              validDate = `${trDateMatch[3]}-${trDateMatch[2]}-${trDateMatch[1]}`;
                              continue;
                          }

                          // 3. Telefon / Müşteri No Kontrolü (10-13 Haneli)
                          const numericOnly = cellStr.replace(/\D/g, '');
                          if (numericOnly.length >= 10 && numericOnly.length <= 13 && (numericOnly.startsWith('5') || numericOnly.startsWith('05') || numericOnly.startsWith('905'))) {
                              if (!phoneRaw) phoneRaw = numericOnly;
                              continue;
                          }

                          // 4. Kira Tutarı (Dört Haneli ve Üzeri Rakamların En Büyüğü)
                          if (typeof cell === 'number') {
                              if (cell >= 1000 && cell <= 999999) {
                                  if (cell > maxRent) maxRent = cell;
                              }
                              continue;
                          } else {
                              const numVal = parseFloat(cellStr.replace(/,/g, '.').replace(/[^\d.-]/g, ''));
                              if (!isNaN(numVal) && numVal >= 1000 && numVal <= 999999) {
                                  if (numVal > maxRent) maxRent = numVal;
                                  continue;
                              }
                          }

                          // 5. Ad Soyad Kontrolü (Harf barındıran en olası string)
                          if (cellStr.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/) && cellStr.length > 3 && !nameRaw) {
                              // Rastgele oda kodlarına benzemiyorsa isimdir
                              if (!cellUpper.match(/^[A-Z]\s*[-_]?\s*\d{1,4}$/)) {
                                  nameRaw = cellUpper;
                              }
                          }
                      }

                      if (!nameRaw && roomsRaw.length === 0) continue; // Geçersiz veya boş satır

                      // Exceldeki Telefon Numarası = Sistemdeki Müşteri Numarası Yapılır
                      let customerNo = phoneRaw || Math.floor(10000 + Math.random() * 90000).toString();
                      
                      let existingCust = customers.find(c => (phoneRaw && c.phone === phoneRaw) || c.name === nameRaw) || newCustomers.find(c => (phoneRaw && c.phone === phoneRaw) || c.name === nameRaw);

                      if (!existingCust && nameRaw) {
                          existingCust = {
                              id: Date.now() + Math.random(),
                              customerNo: customerNo,
                              name: nameRaw,
                              tc: '',
                              phone: phoneRaw,
                              altPhone: '', address: '', notes: 'Excel ile otomatik aktarıldı.',
                              hasProxy: false, proxyName: '', proxyTc: '', proxyPhone: '', proxyAltPhone: '', proxyAddress: '', proxyDocumentPhoto: null,
                              type: 'bireysel',
                              createdAt: new Date().toLocaleDateString('tr-TR'),
                              createdBy: currentUserProfile.name,
                              invoices: [], documentPhoto: null, payments: [], extraDebts: [], ledgerOverrides: []
                          };
                          newCustomers.push(existingCust);
                          importedCustomerCount++;
                      }

                      // Müşterinin odalarını eşleştirip kiralamayı başlat
                      if (roomsRaw.length > 0 && existingCust) {
                          roomsRaw.forEach(rName => {
                              roomUpdates[rName] = {
                                  customerName: existingCust.name,
                                  entryDate: validDate,
                                  paymentDate: validDate,
                                  monthlyFee: maxRent > 0 ? maxRent : 0, // En büyük sayıyı kiraya aktar
                                  hasKdv: true, // Varsayılan KDV ile
                                  paidMonths: [],
                                  rentedBy: currentUserProfile.name
                              };
                              updatedRoomCount++;
                          });
                      }
                  }

      if (newCustomers.length > 0 && db && firebaseUser) {
                      for (const cust of newCustomers) {
                          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(cust.id)), cust);
                      }
                  }

                  if (Object.keys(roomUpdates).length > 0 && db && firebaseUser) {
                      for (const rName of Object.keys(roomUpdates)) {
                          const roomToUpdate = rooms.find(r => r.name === rName);
                          if (roomToUpdate) {
                              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(roomToUpdate.id)), roomUpdates[rName], { merge: true });
                          }
                      }
                  }

                  setCustomerImportResult({ importedCustomerCount, updatedRoomCount });

              } catch (err) {
                  console.error(err);
                  alert("Dosya okunurken bir hata oluştu. Lütfen formatı kontrol edin.");
              } finally {
                  setIsCustomerUploading(false);
              }
          };
          reader.readAsArrayBuffer(file);
      } catch (error) {
          alert("Excel kütüphanesi yüklenirken bir hata oluştu.");
          setIsCustomerUploading(false);
      }
      e.target.value = '';
  };

  // YENİ EKLENEN: Müşterinin TÜM KDV'siz odalarını, BUNDAN SONRAKİ aylar için "KDV dahil" hale çevirir.
  // Geçmiş aylar eski (KDV'siz) haliyle KALIR; sadece geçiş ayından (kdvStartKey) itibaren KDV dahil işlenir.
  // Müşterinin ödediği tutar DEĞİŞMEZ: yeni baz = eski kira / 1.20, ×1.20 = yine aynı rakam (faturalı).
  const handleConvertCustomerToKdv = async (customerId) => {
      const customerToUpdate = customers.find(c => String(c.id) === String(customerId));
      if (!customerToUpdate) return;
      const kdvsizRooms = rooms.filter(r => r.customerName === customerToUpdate.name && r.hasKdv === false);
      if (kdvsizRooms.length === 0) {
          alert("Bu müşterinin KDV'siz bir odası bulunmuyor.");
          return;
      }
      if (!window.confirm(`${customerToUpdate.name} müşterisinin tüm KDV'siz odaları, BU AYDAN İTİBAREN faturalı (KDV dahil) hale getirilecek. Aylık tutar HİÇ DEĞİŞMEZ; sadece bu aydan sonraki aylarda tutarın içinden KDV ayrıştırılır. Geçmiş aylar olduğu gibi kalır. Onaylıyor musunuz?`)) return;

      // Geçiş anahtarı: bu ayın yıl-ay değeri (ledger bu aydan itibaren KDV dahil işler)
      const now = new Date();
      const kdvStartKey = `${now.getFullYear()}-${now.getMonth()}`;

      // Yeni baz: tutar HİÇ DEĞİŞMEZ. monthlyFee aynen kalır; sadece geçişten sonraki aylar
      // "KDV dahil" kabul edilir (ledger içeriden KDV ayrıştırır). Böylece görünen tutar sabittir.
      const buildKdvUpdate = (room) => {
          return { hasKdv: true, kdvStartKey };
      };

      if (db && firebaseUser) {
          try {
              for (const room of kdvsizRooms) {
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(room.id)), buildKdvUpdate(room), { merge: true });
              }
          } catch(e) { console.error("KDV'li Yapma Hatası:", e); }
      } else {
          // Önizleme modu: yerel state güncelle
          setRooms(prev => prev.map(r => {
              if (r.customerName === customerToUpdate.name && r.hasKdv === false) {
                  return { ...r, ...buildKdvUpdate(r) };
              }
              return r;
          }));
      }
      alert(`${customerToUpdate.name} müşterisinin ${kdvsizRooms.length} odası bu aydan itibaren faturalı (KDV dahil) hale getirildi. Aylık tutar değişmedi; geçmiş aylar aynı kaldı, yeni aylarda tutarın içinden KDV ayrıştırılıyor.`);
  };

  // YENİ EKLENEN: E-Faturaya/yeni IBAN'a geçiş bilgilendirme mesajı (WhatsApp veya SMS)
  const handleSendKdvSwitchInfo = (customer, platform) => {
      const iban = contractSettings.iban || '';
      const bank = contractSettings.bankFullName || '';
      const owner = contractSettings.accountHolder || '';
      // YENİ EKLENEN: Müşterinin güncel cari borcunu hesapla ve mesaja ekle
      const { balance } = getCustomerLedger(customer);
      const borcVar = balance > 0;
      const formattedBalance = Math.round(balance).toLocaleString('tr-TR');
      const borcSatiri = borcVar
          ? `\n💰 *Güncel Cari Borcunuz: ${formattedBalance} TL*\nÖdemenizi yukarıdaki IBAN'a yaptıktan sonra hesabınıza işlenecektir.\n`
          : `\n✅ *Güncel Durum:* Cari hesabınızda bekleyen bir borcunuz bulunmamaktadır.\n`;
      const text = `Değerli müşterimiz ${customer.name},\n\nFirmamız E-Fatura sistemine geçiş yapmıştır. Bu kapsamda ödemelerinizi bundan sonra aşağıdaki YENİ şirket IBAN'ımıza göndermeniz gerekmektedir.\n\nBu yalnızca bir sistem/muhasebe değişikliğidir; eşyalarınız yine aynı güvenli şekilde depolanmaya devam edecek ve kiranız haricinde size herhangi bir ekstra bedel yansıtılmayacaktır.\n${borcSatiri}\n🏦 *Yeni Ödeme Bilgileri*\nBanka: ${bank}\nHesap Sahibi: ${owner}\nIBAN: ${iban}\n\n⚠️ *ÖNEMLİ:* Ödeme yaparken açıklama kısmına mutlaka *${customer.customerNo}* numaralı Müşteri Numaranızı yazınız. Böylece ödemeniz hızlıca hesabınıza işlenebilir.\n\nAnlayışınız için teşekkür eder, iyi günler dileriz.\nDepoEvim`;
      const encoded = encodeURIComponent(text);

      // Telefon numarasını normalize et (boşluk/tire temizle, baştaki 0/90 kaldır)
      let rawPhone = String(customer.phone || '').replace(/\D/g, '');
      if (rawPhone.startsWith('90')) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith('0')) rawPhone = rawPhone.slice(1);

      if (platform === 'whatsapp') {
          window.open(`https://wa.me/90${rawPhone}?text=${encoded}`, '_blank');
      } else if (platform === 'sms') {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          const separator = isIOS ? '&' : '?';
          window.open(`sms:+90${rawPhone}${separator}body=${encoded}`, '_self');
      }
  };


  return (
    <>
      {activeMenu === 'musteri-ekle' && (
            /* YENİ: Form içeriği ortak fonksiyona taşındı — hızlı ekleme modalı ile AYNI içerik */
            renderNewCustomerForm()
      )}

      {(activeMenu === 'mevcut-musteriler' || activeMenu === 'tum-musteriler') && !selectedCustomerId && (
            <div className="max-w-7xl mx-auto flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <style>{`@keyframes depoBlink{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.5);transform:scale(1);}50%{box-shadow:0 0 0 8px rgba(99,102,241,0);transform:scale(1.03);}}`}</style>
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                <div><h2 className="text-2xl font-bold text-slate-800">Müşteri Listesi</h2><p className="text-sm text-gray-500 mt-1">Tüm müşteriler tek ekranda. En yeni kayıtlar en üstte listelenir.</p></div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Zamanlama (kayıt tarihi) filtresi */}
                    <div className="relative">
                        <button onClick={() => { setCustTimeDropdownOpen(!custTimeDropdownOpen); setCustRoomDropdownOpen(false); }} className="flex items-center gap-1.5 bg-white border border-gray-200 hover:border-indigo-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm">
                            <Calendar size={16} className="text-indigo-500"/> Zamanlama
                            {custTimeFilter !== 'all' && <span className="bg-indigo-100 text-indigo-600 text-[10px] px-1.5 py-0.5 rounded-full">{({today:'Bugün',yesterday:'Dün',week:'Bu Hafta',month:'Bu Ay',year:'Bu Sene'})[custTimeFilter]}</span>}
                            <ChevronDown size={14}/>
                        </button>
                        {custTimeDropdownOpen && (
                            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-100 rounded-xl shadow-lg z-30 overflow-hidden py-1">
                                {[['today','Bugün Kayıt Olanlar'],['yesterday','Dün Kayıt Olanlar'],['week','Bu Hafta Kayıt Olanlar'],['month','Bu Ay Kayıt Olanlar'],['year','Bu Sene Kayıt Olanlar'],['all','Tüm Zamanlar']].map(([val,label]) => (
                                    <button key={val} onClick={() => { setCustTimeFilter(val); setCustTimeDropdownOpen(false); }} className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${custTimeFilter === val ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}>{label}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    {/* Mevcut Müşteriler / Odası Olmayan filtresi */}
                    <div className="relative">
                        <button onClick={() => { setCustRoomDropdownOpen(!custRoomDropdownOpen); setCustTimeDropdownOpen(false); }} className="flex items-center gap-1.5 bg-white border border-gray-200 hover:border-teal-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm">
                            <Users size={16} className="text-teal-500"/> {custRoomFilter === 'noRoom' ? 'Odası Olmayan' : custRoomFilter === 'withRoom' ? 'Mevcut Müşteriler' : 'Müşteriler'}
                            <ChevronDown size={14}/>
                        </button>
                        {custRoomDropdownOpen && (
                            <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-100 rounded-xl shadow-lg z-30 overflow-hidden py-1">
                                <button onClick={() => { setCustRoomFilter('all'); setCustRoomDropdownOpen(false); }} className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${custRoomFilter === 'all' ? 'bg-teal-50 text-teal-600' : 'text-gray-600 hover:bg-gray-50'}`}>Tüm Müşteriler</button>
                                <button onClick={() => { setCustRoomFilter('withRoom'); setCustRoomDropdownOpen(false); }} className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${custRoomFilter === 'withRoom' ? 'bg-teal-50 text-teal-600' : 'text-gray-600 hover:bg-gray-50'}`}>Mevcut Müşteriler (Odası Olan)</button>
                                <button onClick={() => { setCustRoomFilter('noRoom'); setCustRoomDropdownOpen(false); }} className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${custRoomFilter === 'noRoom' ? 'bg-teal-50 text-teal-600' : 'text-gray-600 hover:bg-gray-50'}`}>Odası Olmayan Müşteriler</button>
                            </div>
                        )}
                    </div>
                    {/* Yeni Müşteri Ekle — büyük, dikkat çeken, yanıp sönen */}
                    <button onClick={() => setActiveMenu('musteri-ekle')} style={{animation:'depoBlink 1.5s infinite'}} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl text-sm font-extrabold transition-colors shadow-lg shadow-indigo-500/40">
                        <Plus size={18} strokeWidth={3}/> Yeni Müşteri Ekle
                    </button>
                </div>
              </div>

              {customerImportResult && (
                <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-1.5 rounded-full shrink-0"><Check size={16} className="text-emerald-600" strokeWidth={3}/></div>
                        <span className="font-medium text-sm">İşlem Tamamlandı: <strong>{customerImportResult.importedCustomerCount}</strong> yeni müşteri eklendi, <strong>{customerImportResult.updatedRoomCount}</strong> oda müşterilere başarıyla kiralandı.</span>
                    </div>
                    <button onClick={() => setCustomerImportResult(null)} className="text-emerald-500 hover:text-emerald-700 shrink-0"><X size={16}/></button>
                </div>
              )}

              <div className="flex justify-end items-center mb-4 text-sm text-gray-600">
                <div className="flex items-center gap-2"><span>Müşteri Arat</span><input type="text" value={customerSearchTerm} onChange={(e) => setCustomerSearchTerm(e.target.value)} className="border border-gray-300 rounded p-1.5 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 w-48 lg:w-64" /></div>
              </div>
<div className="overflow-x-auto border border-gray-200 rounded-lg flex-1 bg-slate-50 w-full block">
                 {(() => {
                    // Oda filtresi: Tüm Müşteriler sayfası temel alınır, birleşik filtre uygulanır
                    let base = customers;
                    // YENİ: AVUKAT rolü yalnızca İCRA sürecindeki müşterileri görür.
                    if (isAvukat()) base = customers.filter(c => rooms.some(r => r.customerName === c.name && r.isUnderLegalAction));
                    if (custRoomFilter === 'withRoom' || activeMenu === 'mevcut-musteriler') base = base.filter(c => rooms.some(r => r.customerName === c.name));
                    else if (custRoomFilter === 'noRoom') base = base.filter(c => !rooms.some(r => r.customerName === c.name));

                    // Zamanlama filtresi (kayıt tarihine göre)
                    const timeFiltered = base.filter(c => custTimeFilter === 'all' ? true : inDashboardRange(parseAnyDate(c.createdAt), custTimeFilter));

                    // Arama
                    const term = normalizeStr(customerSearchTerm);
                    let finalFiltered = timeFiltered.filter(c => normalizeStr(c.name).includes(term));

                    // En yeni kayıt en üstte: createdAt'e göre azalan sırala
                    finalFiltered = [...finalFiltered].sort((a, b) => {
                        const da = parseAnyDate(a.createdAt); const db2 = parseAnyDate(b.createdAt);
                        if (da && db2) return db2 - da;
                        if (db2 && !da) return 1; if (da && !db2) return -1;
                        return (Number(b.id) || 0) - (Number(a.id) || 0);
                    });
                      if (finalFiltered.length === 0) return (<div className="flex flex-col items-center justify-center text-center py-20 w-full min-h-[300px]"><div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"><Users size={32} /></div><h3 className="text-lg font-bold text-gray-600 mb-1">Müşteri Kaydı Bulunmuyor</h3><p className="text-sm text-gray-400 max-w-sm mx-auto">Seçili filtrelerde gösterilecek müşteri bulunamadı. Sağ üstteki "Yeni Müşteri Ekle" ile ekleme yapabilirsiniz.</p></div>);

                    return (
                      <table className="w-full text-sm text-left text-gray-600 min-w-[800px] h-full self-start">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 font-semibold w-12">#</th>
                            <th className="px-4 py-3 font-semibold">Müşteri No</th>
                            <th className="px-4 py-3 font-semibold">İsim</th>
                            <th className="px-4 py-3 font-semibold">TC / VKN</th>
                            <th className="px-4 py-3 font-semibold">Telefon</th>
                            <th className="px-4 py-3 font-semibold">Kayıt Tarihi</th>
                            <th className="px-4 py-3 font-semibold text-center w-32">İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {finalFiltered.map((customer, index) => (
                            <tr key={customer.id} className="bg-white border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-3">{index + 1}</td>
                              <td className="px-4 py-3 font-bold text-[#1bc5bd] tracking-wider">{customer.customerNo}</td>
                              <td className="px-4 py-3 font-bold text-gray-800 cursor-pointer hover:text-[#1bc5bd] hover:underline transition-all" onClick={() => setSelectedCustomerId(customer.id)} title="Müşteri Profilini Görüntüle">{customer.name}</td>
                              <td className="px-4 py-3">{customer.tc}</td>
                              <td className="px-4 py-3">{customer.phone}</td>
                              {/* YENİ: Müşterinin kayıt tarihi */}
                              <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-medium">{customer.createdAt ? (typeof customer.createdAt === 'number' ? new Date(customer.createdAt).toLocaleDateString('tr-TR') : customer.createdAt) : '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center gap-1.5 justify-center">
                                  <a href={`#m=tum-musteriler&c=${customer.id}`} onClick={(e) => handleNavClick(e, () => setSelectedCustomerId(customer.id))} className="bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-[11px] font-medium shadow-sm transition-colors flex-1 text-center no-underline">Cari Hesap</a>
                                  <button onClick={(e) => { e.stopPropagation(); if(!checkActionPerm('action-musteri-sil')) return; setCustomerToDeleteId(customer.id); setIsDeleteCustomerModalOpen(true); }} className="bg-[#f64e60] hover:bg-red-600 text-white px-3 py-1.5 rounded text-[11px] font-medium shadow-sm transition-colors flex-1" title="Kalıcı Olarak Sil">Sil</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                 })()}
              </div>
            </div>
      )}

      {selectedCustomerId && (
            <div className="max-w-7xl mx-auto animate-in fade-in duration-300">
               <div className="mb-6 flex items-center justify-between">
                 <div>
                   <button onClick={() => setSelectedCustomerId(null)} className="text-[10px] font-bold text-gray-400 hover:text-[#1bc5bd] tracking-widest uppercase mb-1.5 flex items-center gap-1 transition-colors"><ArrowLeft size={12} /> Listeye Geri Dön</button>
                   <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">Cari Hesap Profili</h2>
                 </div>
               </div>
               {(() => {
                  const customer = customers.find(c => c.id === selectedCustomerId);
                  if(!customer) return <div>Müşteri Bulunamadı.</div>;
                  const customerRooms = rooms.filter(r => r.customerName === customer.name);
                  // YENİ: AVUKAT KISITI — avukat rolü yalnızca İCRADAKİ müşterilerin carisini görebilir.
                  if (isAvukat() && !customerRooms.some(r => r.isUnderLegalAction)) {
                      return (
                          <div className="bg-white rounded-2xl border border-amber-200 p-8 text-center shadow-sm">
                              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3"><Shield size={22}/></div>
                              <h3 className="text-base font-bold text-slate-800 mb-1">Görüntüleme Yetkiniz Yok</h3>
                              <p className="text-sm text-gray-500">Avukat rolü yalnızca <strong>icra sürecindeki</strong> müşterilerin carilerini görüntüleyebilir.</p>
                          </div>
                      );
                  }

                  // --- Cari Ledger (Ekstre) Hesaplama ---
                  const { ledger: fullLedger, balance: runningBalance } = getCustomerLedger(customer);
                  
                  const availableYears = [...new Set(fullLedger.map(tx => {
                      const d = new Date(tx.date);
                      return !isNaN(d.getTime()) ? d.getFullYear() : null;
                  }).filter(y => y !== null))].sort((a, b) => b - a);
                  
                  if (!availableYears.includes(new Date().getFullYear())) {
                      availableYears.push(new Date().getFullYear());
                      availableYears.sort((a, b) => b - a);
                  }

                  const filteredLedger = ledgerFilterYear === 'all' 
                      ? fullLedger 
                      : fullLedger.filter(tx => {
                          const d = new Date(tx.date);
                          return !isNaN(d.getTime()) && d.getFullYear().toString() === ledgerFilterYear;
                      });

                  return (
                    <div className="flex flex-col gap-6">
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 flex flex-col gap-6">
                         <div className="flex flex-col md:flex-row gap-8 items-start md:items-center justify-between border-b border-gray-100 pb-6">
                           <div className="flex items-center gap-5">
                              <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-2xl shadow-inner">{customer.name.charAt(0)}</div>
                              <div>
                                 <h3 className="text-xl font-bold text-gray-800 mb-1 flex items-center">
                                     {customer.name} 
                                     <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px] font-bold ml-3 border border-gray-200 shadow-sm flex items-center gap-1">
                                         Kayıt: {customer.createdAt || '01.01.2026'}
                                         <button onClick={() => { setEditCustomerData({...customer}); setIsEditCustomerModalOpen(true); }} className="hover:text-[#1bc5bd] transition-colors bg-white p-0.5 rounded shadow-sm border border-gray-200" title="Müşteri Bilgilerini Düzenle"><Edit size={10} /></button>
                                     </span>
                                     {/* YENİ: Cariyi oluşturan kullanıcı rozeti (eski kayıtlarda alan yoksa gösterilmez) */}
                                     {customer.createdBy && (
                                         <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold ml-2 border border-indigo-100 shadow-sm flex items-center gap-1" title={`Bu cariyi ${customer.createdBy} oluşturdu${customer.createdByRole ? ' (' + customer.createdByRole + ')' : ''}${customer.createdAtTs ? ' • ' + new Date(customer.createdAtTs).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}`}>
                                             <UserPlus size={10} /> Kaydeden: {customer.createdBy}{customer.createdByRole ? <span className="text-indigo-400 font-medium">({customer.createdByRole})</span> : null}
                                         </span>
                                     )}
                                 </h3>
                                 <p className="text-sm font-medium text-[#1bc5bd]">Müşteri No: {customer.customerNo}</p>
                                 <div className="flex gap-4 mt-2 text-xs text-gray-500 font-medium">
                                   <span className="flex items-center gap-1"><Phone size={12}/> {customer.phone}</span>
                                   <span className="flex items-center gap-1"><FileTextIcon size={12}/> {customer.tc || 'TC/VKN Yok'}</span>
                                   {customer.createdBy && <span className="flex items-center gap-1"><UserCog size={12}/> Ekleyen: {customer.createdBy}</span>}
                                 </div>
                              </div>
                           </div>
                           <div className="flex flex-wrap gap-2 justify-end">
                              <a href={`tel:+90${customer.phone}`} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"><Phone size={14}/> Ara</a>
                              <a href={`https://wa.me/90${customer.phone}`} target="_blank" rel="noreferrer" className="bg-[#1bc5bd] hover:bg-teal-500 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-teal-500/30"><MessageCircle size={14}/> WhatsApp</a>
                              <button onClick={() => setIsInvoiceModalOpen(true)} className="bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-cyan-500/30"><FileTextIcon size={14}/> Faturalar</button>
                              {/* YENİ EKLENEN: Sözleşmeler bölümü */}
                              <button onClick={() => setIsContractsModalOpen(true)} className="bg-violet-500 hover:bg-violet-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-violet-500/30"><FileTextIcon size={14}/> Sözleşmeler</button>
                              {/* YENİ EKLENEN: Sadece KDV'siz odası olan müşterilerde görünen KDV'li Yap + Bilgilendirme butonları */}
                              {customerRooms.some(r => r.hasKdv === false) && (
                                  <>
                                      <button onClick={() => handleConvertCustomerToKdv(customer.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-emerald-500/30" title="Tüm KDV'siz odaları, ödeme tutarı değişmeden KDV dahil (faturalı) hale getir"><FileTextIcon size={14}/> KDV'li Yap</button>
                                      <div className="relative">
                                          <button onClick={() => setKdvInfoMenuFor(kdvInfoMenuFor === customer.id ? null : customer.id)} className="bg-teal-500 hover:bg-teal-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-teal-500/30" title="E-Fatura / yeni IBAN geçiş bilgilendirmesi gönder"><MessageCircle size={14}/> Bilgilendir</button>
                                          {kdvInfoMenuFor === customer.id && (
                                              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-2xl border border-gray-100 z-30 overflow-hidden">
                                                  <div className="px-3 py-2 bg-teal-50 border-b border-teal-100 text-[10px] font-bold text-teal-700 uppercase tracking-wider">E-Fatura Geçiş Bilgisi</div>
                                                  <button onClick={() => { handleSendKdvSwitchInfo(customer, 'whatsapp'); setKdvInfoMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-green-50 transition-colors">
                                                      <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0"><MessageCircle size={14}/></div> WhatsApp'tan Gönder
                                                  </button>
                                                  <button onClick={() => { handleSendKdvSwitchInfo(customer, 'sms'); setKdvInfoMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-blue-50 transition-colors border-t border-gray-100">
                                                      <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0"><Phone size={14}/></div> Mesaj (SMS) Gönder
                                                  </button>
                                              </div>
                                          )}
                                      </div>
                                  </>
                              )}
                              <button onClick={() => setReminderModal({ mode: 'add', data: { date: new Date().toISOString().split('T')[0], time: '', title: 'Cari', note: '', type: 'promise', customerName: customer.name, completed: false, files: [] } })} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm border border-emerald-100" title="Bu müşteri için ödeme sözü hatırlatması oluştur"><Bell size={14}/> Ödeme Sözü Hatırlat</button>
                              <button onClick={() => { if(!checkActionPerm('action-musteri-sil')) return; setCustomerToDeleteId(customer.id); setIsDeleteCustomerModalOpen(true); }} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm border border-red-100"><Trash2 size={14}/> Kalıcı Sil</button>
                           </div>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-6 bg-slate-50 p-5 rounded-xl border border-gray-100">
                            <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Alternatif Telefon</span><span className="text-sm font-semibold text-gray-700">{customer.altPhone || '-'}</span></div>
                            {/* YENİ: E-Posta gösterimi — tıklanınca mail uygulaması açılır */}
                            <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">E-Posta</span>{customer.email ? <a href={`mailto:${customer.email}`} className="text-sm font-semibold text-indigo-600 hover:underline break-all">{customer.email}</a> : <span className="text-sm font-semibold text-gray-700">-</span>}</div>
                            <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Müşteri Tipi</span><span className="text-sm font-semibold text-gray-700 capitalize">{customer.type || 'Bireysel'}</span></div>
                            <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">TC / Vergi No</span><span className="text-sm font-semibold text-gray-700">{customer.tc || '-'}</span></div>
                            <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">İl</span><span className="text-sm font-semibold text-gray-700">{customer.city || '-'}</span></div>
                            <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">İlçe</span><span className="text-sm font-semibold text-gray-700">{customer.district || '-'}</span></div>
                            <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Vergi Dairesi</span><span className="text-sm font-semibold text-gray-700">{customer.taxOffice || '-'}</span></div>
                            <div className="flex flex-col gap-1.5 md:col-span-3"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Açık Adres</span><span className="text-sm font-semibold text-gray-700">{customer.address || 'Adres bilgisi girilmemiş.'}</span></div>
                            <div className="flex flex-col gap-1.5 md:col-span-3"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Özel Notlar</span><span className="text-sm font-semibold text-gray-700">{customer.notes || 'Not eklenmemiş.'}</span></div>
                            
                            {/* VEKALET EDEN BİLGİLERİ GÖRÜNÜMÜ */}
                            {customer.hasProxy && (
                                <div className="md:col-span-3 mt-4 bg-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
                                    <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2 mb-4 border-b border-indigo-100 pb-3"><Shield size={18}/> Vekalet Eden Kişi (Vekil) Bilgileri</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 gap-x-6">
                                        <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Ad Soyad</span><span className="text-sm font-semibold text-indigo-900">{customer.proxyName || '-'}</span></div>
                                        <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">TC Kimlik No</span><span className="text-sm font-semibold text-indigo-900">{customer.proxyTc || '-'}</span></div>
                                        <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Telefon</span><span className="text-sm font-semibold text-indigo-900">{customer.proxyPhone || '-'}</span></div>
                                        <div className="flex flex-col gap-1.5"><span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Yedek Telefon</span><span className="text-sm font-semibold text-indigo-900">{customer.proxyAltPhone || '-'}</span></div>
                                        <div className="flex flex-col gap-1.5 md:col-span-2"><span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Adres</span><span className="text-sm font-semibold text-indigo-900">{customer.proxyAddress || '-'}</span></div>
                                        {customer.proxyDocumentPhoto && (
                                            <div className="flex flex-col gap-1.5 md:col-span-3 mt-2">
                                                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Vekil Kimlik Belgesi</span>
                                                <div className="border border-indigo-200 rounded p-2 bg-white w-max shadow-sm">
                                                    <a href={customer.proxyDocumentPhoto} target="_blank" rel="noreferrer">
                                                        <img src={customer.proxyDocumentPhoto} alt="Vekil Belge" className="h-24 object-contain rounded" />
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                        {/* YENİ EKLENEN: Birden fazla vekalet belgesi — ek belgeler yan yana listelenir */}
                                        {Array.isArray(customer.proxyDocumentPhotos) && customer.proxyDocumentPhotos.length > 0 && (
                                            <div className="flex flex-col gap-1.5 md:col-span-3 mt-2">
                                                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Ek Vekalet Belgeleri ({customer.proxyDocumentPhotos.length} adet)</span>
                                                <div className="flex flex-wrap gap-3">
                                                    {customer.proxyDocumentPhotos.map((docUrl, idx) => (
                                                        <div key={idx} className="border border-indigo-200 rounded p-2 bg-white shadow-sm flex flex-col items-center gap-1">
                                                            <a href={docUrl} target="_blank" rel="noreferrer">
                                                                <img src={docUrl} alt={`Ek Vekalet Belgesi ${idx + 1}`} className="h-24 object-contain rounded" />
                                                            </a>
                                                            <span className="text-[10px] font-bold text-indigo-500">Ek Belge {idx + 1}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {}
                            <div className="flex flex-col gap-4 md:col-span-3 mt-2 pt-4 border-t border-gray-200">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                   {/* Kimlik / Vergi Levhası Alanı */}
                                   <div className="flex flex-col gap-2">
                                       <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                                          {customer.type === 'bireysel' ? 'Kimlik Belgesi (Ön ve Arka)' : 'Vergi Levhası / Ek Belgeler'}
                                          {/* YENİ: Düzenleme butonu — tıklanınca Değiştir/Sil butonları görünür/gizlenir */}
                                          <button onClick={() => setIsEditingIdDocs(!isEditingIdDocs)} className={`ml-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold normal-case transition-colors ${isEditingIdDocs ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-500 border border-gray-200'}`} title="Düzenle"><Edit size={11}/> {isEditingIdDocs ? 'Bitir' : 'Düzenle'}</button>
                                       </span>
                                       <div className="flex flex-wrap gap-4">
                                           {/* ÖN YÜZ — görsel + ekle/değiştir/sil butonları */}
                                           <div className="flex flex-col gap-1.5 w-max">
                                               {(customer.documentPhotoFront || customer.documentPhoto) ? (
                                                   <div className="border border-gray-200 rounded p-2 bg-white w-max relative group shadow-sm hover:shadow transition-shadow">
                                                       <a href={customer.documentPhotoFront || customer.documentPhoto} target="_blank" rel="noreferrer">
                                                           <img src={customer.documentPhotoFront || customer.documentPhoto} alt="Ön Yüz" className="h-32 object-contain rounded" />
                                                       </a>
                                                       <div className="text-[10px] text-center text-gray-500 mt-1 font-medium">Ön Yüz</div>
                                                   </div>
                                               ) : (
                                                   <div className="border border-dashed border-gray-300 rounded p-4 bg-gray-50 flex flex-col items-center justify-center h-36 w-32 shadow-inner">
                                                       <span className="text-xs text-gray-400 font-medium text-center px-2">Ön Yüz Yok</span>
                                                   </div>
                                               )}
                                               {isEditingIdDocs && (
                                               <div className="flex gap-1.5">
                                                   <label className="flex-1 cursor-pointer text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1">
                                                       <Upload size={12} /> {(customer.documentPhotoFront || customer.documentPhoto) ? 'Değiştir' : 'Ekle'}
                                                       <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => { const f = e.target.files[0]; if (f) handleUpdateCustomerDocument('front', f); e.target.value = ''; }} />
                                                   </label>
                                                   {(customer.documentPhotoFront || customer.documentPhoto) && (
                                                       <button onClick={() => { if (window.confirm('Ön yüz görselini silmek istediğinize emin misiniz?')) handleUpdateCustomerDocument('front', null); }} className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-1.5 rounded-lg transition-colors flex items-center justify-center"><Trash2 size={12} /></button>
                                                   )}
                                               </div>
                                               )}
                                           </div>

                                           {/* ARKA YÜZ — görsel + ekle/değiştir/sil butonları */}
                                           <div className="flex flex-col gap-1.5 w-max">
                                               {customer.documentPhotoBack ? (
                                                   <div className="border border-gray-200 rounded p-2 bg-white w-max relative group shadow-sm hover:shadow transition-shadow">
                                                       <a href={customer.documentPhotoBack} target="_blank" rel="noreferrer">
                                                           <img src={customer.documentPhotoBack} alt="Arka Yüz" className="h-32 object-contain rounded" />
                                                       </a>
                                                       <div className="text-[10px] text-center text-gray-500 mt-1 font-medium">Arka Yüz</div>
                                                   </div>
                                               ) : (
                                                   <div className="border border-dashed border-gray-300 rounded p-4 bg-gray-50 flex flex-col items-center justify-center h-36 w-32 shadow-inner">
                                                       <span className="text-xs text-gray-400 font-medium text-center px-2">Arka Yüz Yok</span>
                                                   </div>
                                               )}
                                               {isEditingIdDocs && (
                                               <div className="flex gap-1.5">
                                                   <label className="flex-1 cursor-pointer text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1">
                                                       <Upload size={12} /> {customer.documentPhotoBack ? 'Değiştir' : 'Ekle'}
                                                       <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => { const f = e.target.files[0]; if (f) handleUpdateCustomerDocument('back', f); e.target.value = ''; }} />
                                                   </label>
                                                   {customer.documentPhotoBack && (
                                                       <button onClick={() => { if (window.confirm('Arka yüz görselini silmek istediğinize emin misiniz?')) handleUpdateCustomerDocument('back', null); }} className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-1.5 rounded-lg transition-colors flex items-center justify-center"><Trash2 size={12} /></button>
                                                   )}
                                               </div>
                                               )}
                                           </div>
                                       </div>
                                   </div>
                                   
                                   {/* Ek Belgeler / Arşiv Belgeleri Alanı — SEKMELİ */}
                                   <div className="flex flex-col gap-3">
                                       <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Arşiv Belgeleri / Ek Belgeler</span>
                                       {/* Sekme başlıkları */}
                                       <div className="flex flex-wrap gap-1.5 bg-gray-100 p-1 rounded-xl">
                                           {[
                                             { id: 'faturalar', label: 'Faturalar', count: (customer.invoices || []).length },
                                             { id: 'sozlesmeler', label: 'Sözleşmeler', count: (customer.contracts || []).length },
                                             { id: 'odafoto', label: 'Oda Görseli', count: getCustomerRoomPhotos(customer.name).length },
                                             { id: 'ekbelge', label: 'Ek Belgeler', count: (customer.extraDocuments || []).length }
                                           ].map(t => (
                                               <button key={t.id} onClick={() => setArchiveTab(t.id)} className={`flex-1 min-w-[80px] px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${archiveTab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                                   {t.label} <span className={`ml-0.5 ${archiveTab === t.id ? 'text-[#1bc5bd]' : 'text-gray-400'}`}>({t.count})</span>
                                               </button>
                                           ))}
                                       </div>

                                       {/* FATURALAR */}
                                       {archiveTab === 'faturalar' && (
                                           <div className="border border-gray-200 rounded-xl p-3 bg-white min-h-[9rem] flex flex-wrap gap-3 items-start content-start shadow-inner">
                                               {(!customer.invoices || customer.invoices.length === 0) ? (
                                                   <div className="w-full flex flex-col items-center justify-center text-gray-400 opacity-70 py-8">
                                                       <FileTextIcon size={24} className="mb-1 text-gray-300" /><span className="text-[10px] font-medium">Henüz fatura bulunmuyor</span>
                                                   </div>
                                               ) : (
                                                   [...customer.invoices].sort((a,b)=>b.id-a.id).map((inv) => (
                                                       <div key={inv.id} className="relative group border border-gray-200 rounded-lg p-2 bg-cyan-50/40 flex flex-col items-center gap-1 w-24 shadow-sm hover:shadow-md transition-all">
                                                           <button type="button" onClick={() => openArchiveFile(inv.file)} className="w-full h-14 flex items-center justify-center bg-white border border-gray-100 rounded-md overflow-hidden cursor-pointer">
                                                               {inv.file && !String(inv.file).includes('pdf') && String(inv.file).startsWith('data:image') ? <img src={inv.file} alt="Fatura" className="w-full h-full object-cover"/> : <FileTextIcon size={22} className="text-cyan-500" />}
                                                           </button>
                                                           <span className="text-[9px] text-gray-600 font-bold truncate w-full text-center">{inv.invoiceNo || 'Fatura'}</span>
                                                           <span className="text-[8px] text-gray-400">{inv.date ? new Date(inv.date).toLocaleDateString('tr-TR') : ''}</span>
                                                           <button onClick={() => handleDeleteInvoiceFromArchive(customer.id, inv.id)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" title="Faturayı Sil"><X size={10} strokeWidth={3} /></button>
                                                       </div>
                                                   ))
                                               )}
                                           </div>
                                       )}

                                       {/* SÖZLEŞMELER */}
                                       {archiveTab === 'sozlesmeler' && (
                                           <div className="border border-gray-200 rounded-xl p-3 bg-white min-h-[9rem] flex flex-wrap gap-3 items-start content-start shadow-inner">
                                               {(!customer.contracts || customer.contracts.length === 0) ? (
                                                   <div className="w-full flex flex-col items-center justify-center text-gray-400 opacity-70 py-8">
                                                       <FileTextIcon size={24} className="mb-1 text-gray-300" /><span className="text-[10px] font-medium">Henüz sözleşme/tutanak bulunmuyor</span>
                                                   </div>
                                               ) : (
                                                   [...customer.contracts].sort((a,b)=>b.id-a.id).map((ct) => (
                                                       <div key={ct.id} className="relative group border border-gray-200 rounded-lg p-2 bg-violet-50/40 flex flex-col items-center gap-1 w-24 shadow-sm hover:shadow-md transition-all">
                                                           <button type="button" onClick={() => openArchiveFile(ct.file)} className="w-full h-14 flex items-center justify-center bg-white border border-gray-100 rounded-md overflow-hidden cursor-pointer">
                                                               {ct.file && String(ct.file).startsWith('data:image') ? <img src={ct.file} alt="Sözleşme" className="w-full h-full object-cover"/> : <FileTextIcon size={22} className="text-violet-500" />}
                                                           </button>
                                                           <span className="text-[9px] text-gray-600 font-bold truncate w-full text-center" title={ct.label}>{ct.label || 'Sözleşme'}</span>
                                                           <span className="text-[8px] text-gray-400">{ct.date ? new Date(ct.date).toLocaleDateString('tr-TR') : ''}</span>
                                                           <button onClick={() => { if (customer.id === selectedCustomerId) handleDeleteContract(ct.id); else { setSelectedCustomerId(customer.id); handleDeleteContract(ct.id); } }} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" title="Sözleşmeyi Sil"><X size={10} strokeWidth={3} /></button>
                                                       </div>
                                                   ))
                                               )}
                                           </div>
                                       )}

                                       {/* ODA FOTOĞRAFLARI */}
                                       {archiveTab === 'odafoto' && (
                                           <div className="border border-gray-200 rounded-xl p-3 bg-white min-h-[9rem] flex flex-wrap gap-3 items-start content-start shadow-inner">
                                               {getCustomerRoomPhotos(customer.name).length === 0 ? (
                                                   <div className="w-full flex flex-col items-center justify-center text-gray-400 opacity-70 py-8">
                                                       <Box size={24} className="mb-1 text-gray-300" /><span className="text-[10px] font-medium">Oda görseli bulunmuyor</span>
                                                   </div>
                                               ) : (
                                                   getCustomerRoomPhotos(customer.name).map((ph) => {
                                                       const isVideo = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(String(ph.url || '')) || String(ph.url || '').startsWith('data:video') || ph.mediaType === 'video';
                                                       return (
                                                       <div key={ph.key} className="relative group border border-gray-200 rounded-lg p-2 bg-indigo-50/40 flex flex-col items-center gap-1 w-24 shadow-sm hover:shadow-md transition-all">
                                                           <button type="button" onClick={() => openArchiveFile(ph.url)} className="w-full h-14 flex items-center justify-center bg-white border border-gray-100 rounded-md overflow-hidden cursor-pointer">
                                                               {isVideo
                                                                  ? <video src={ph.url} className="w-full h-full object-cover bg-black" muted playsInline />
                                                                  : <img src={ph.url} alt={ph.label} className="w-full h-full object-cover transition-transform group-hover:scale-105" />}
                                                           </button>
                                                           <span className="text-[9px] text-gray-600 font-medium truncate w-full text-center" title={ph.label}>{isVideo ? '🎬 ' : ''}{ph.label}</span>
                                                           <button onClick={() => handleDeleteRoomPhoto(ph)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" title="Görseli Kaldır"><X size={10} strokeWidth={3} /></button>
                                                       </div>
                                                       );
                                                   })
                                               )}
                                           </div>
                                       )}

                                       {/* EK BELGELER */}
                                       {archiveTab === 'ekbelge' && (
                                           <div className="flex flex-col gap-2">
                                               <div className="flex justify-end">
                                                   <label className="bg-[#1bc5bd] hover:bg-teal-500 text-white px-2 py-1.5 rounded text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-sm hover:shadow-md">
                                                       <Plus size={12} /> Ekle
                                                       <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" multiple onChange={(e) => handleAddExtraDocument(e, customer.id)} />
                                                   </label>
                                               </div>
                                               <div className="border border-gray-200 rounded-xl p-3 bg-white min-h-[9rem] flex flex-wrap gap-3 items-start content-start shadow-inner">
                                                   {(!customer.extraDocuments || customer.extraDocuments.length === 0) ? (
                                                       <div className="w-full flex flex-col items-center justify-center text-gray-400 opacity-70 py-8">
                                                           <FolderOpen size={24} className="mb-1 text-gray-300" /><span className="text-[10px] font-medium text-gray-400">Henüz ek belge bulunmuyor</span>
                                                       </div>
                                                   ) : (
                                                       customer.extraDocuments.map((doc, idx) => (
                                                           <div key={idx} className="relative group border border-gray-200 rounded-lg p-1 bg-gray-50 flex flex-col items-center gap-1.5 w-20 sm:w-24 shadow-sm hover:shadow-md transition-all">
                                                               <button type="button" onClick={() => openArchiveFile(doc.url)} className="w-full h-14 sm:h-16 flex items-center justify-center bg-white border border-gray-100 rounded-md overflow-hidden cursor-pointer">
                                                                   {doc.url.includes('pdf') || doc.url.startsWith('data:application/pdf') ? (
                                                                       <FileTextIcon size={24} className="text-red-500" />
                                                                   ) : (
                                                                       <img src={doc.url} alt={`Ek Belge ${idx+1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                                                   )}
                                                               </button>
                                                               <span className="text-[9px] text-gray-500 font-medium truncate w-full text-center px-1" title={doc.name}>{doc.name || `Belge ${idx+1}`}</span>
                                                               <button onClick={() => handleDeleteExtraDocument(customer.id, doc.id)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" title="Belgeyi Sil">
                                                                   <X size={10} strokeWidth={3} />
                                                               </button>
                                                           </div>
                                                       ))
                                                   )}
                                               </div>
                                           </div>
                                       )}
                                   </div>
                               </div>
                            </div>
                         </div>
                      </div>

                      {/* YENİ: MÜŞTERİ ODA GEÇMİŞİ — müşteri bir odadan çıkış yaptığında burada listelenir (her oda ayrı satır) */}
                      {(customer.roomHistory && customer.roomHistory.length > 0) && (
                      <div className="mt-2 mb-4 bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
                          <div className="flex items-center gap-2 mb-1"><Clock size={18} className="text-rose-500"/><h4 className="text-sm font-bold text-gray-700">Oda Geçmişi</h4></div>
                          <p className="text-[11px] text-gray-400 mb-4">Müşterinin geçmişte kalıp çıkış yaptığı odalar, süreleri, kira bedelleri ve çıkış/giriş görselleri.</p>
                          <div className="overflow-x-auto border border-gray-100 rounded-xl">
                              <table className="w-full text-left text-sm min-w-[640px]">
                                  <thead className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase text-gray-500 font-bold">
                                      <tr>
                                          <th className="px-3 py-2.5">Oda</th>
                                          <th className="px-3 py-2.5">Giriş</th>
                                          <th className="px-3 py-2.5">Çıkış</th>
                                          <th className="px-3 py-2.5">Süre</th>
                                          <th className="px-3 py-2.5 text-right">Aylık Kira</th>
                                          <th className="px-3 py-2.5 text-center">Nakliye İşlemi</th>
                                          <th className="px-3 py-2.5 text-center">Görseller</th>
                                          <th className="px-3 py-2.5 text-center">Durum</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                      {customer.roomHistory.map((h) => (
                                          <tr key={h.id} className="hover:bg-rose-50/30 transition-colors">
                                              <td className="px-3 py-2.5 font-bold text-gray-700">{h.roomName || '-'}</td>
                                              <td className="px-3 py-2.5 text-gray-600">{h.entryDate || '-'}</td>
                                              <td className="px-3 py-2.5 text-gray-600">{h.exitDate || '-'}</td>
                                              <td className="px-3 py-2.5"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs font-bold border border-gray-200">{h.duration || '-'}</span></td>
                                              <td className="px-3 py-2.5 text-right font-bold text-rose-600">{h.monthlyFee ? Number(h.monthlyFee).toLocaleString('tr-TR') + ' TL' : '-'}</td>
                                              <td className="px-3 py-2.5 text-center">{h.exitBy === 'sembol' ? <span className="bg-teal-50 text-teal-600 px-2 py-0.5 rounded-md text-[10px] font-bold border border-teal-200">Sembol Nakliyat</span> : <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold border border-slate-200">Kendisi</span>}</td>
                                              <td className="px-3 py-2.5">
                                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                      {(h.exitPhoto || h.photo) && <button onClick={() => window.open(h.exitPhoto || h.photo, '_blank')} className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-2 py-1 rounded-md font-bold transition-colors flex items-center gap-1"><Eye size={11}/> Çıkış</button>}
                                                      {h.entryPhoto && <button onClick={() => window.open(h.entryPhoto, '_blank')} className="text-[10px] bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-200 px-2 py-1 rounded-md font-bold transition-colors flex items-center gap-1"><Eye size={11}/> Giriş</button>}
                                                      {h.roomListPhoto && <button onClick={() => window.open(h.roomListPhoto, '_blank')} className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-2 py-1 rounded-md font-bold transition-colors flex items-center gap-1"><Eye size={11}/> Oda</button>}
                                                      {!(h.exitPhoto || h.photo) && !h.entryPhoto && !h.roomListPhoto && <span className="text-[10px] text-gray-400 italic">Görsel yok</span>}
                                                  </div>
                                              </td>
                                              <td className="px-3 py-2.5 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold border border-slate-200">{h.status || 'Çıkış Yaptı'}</span></td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                      )}

                      {/* CARİ HESAP EKSTRESİ YUKARIYA TAŞINDI */}
                      <div className="mt-2 mb-2">
                         {/* YENİ: Cari ekstre üstü bildirimler — kaç aydır tahsilat yok + kaç aylık borcu var.
                             (Aylık Borç Takip'teki hesabın aynısı; cari borç ve güncel aylık kiradan hesaplanır.) */}
                         {(() => {
                             const _bal = Number(getCustomerLedger(customer).balance || 0);
                             if (_bal <= 0) return null;
                             const _rooms = rooms.filter(r => r.customerName === customer.name);
                             let _rent = 0;
                             _rooms.forEach(room => { const b = Number(room.monthlyFee || 0); const k = room.hasKdv !== undefined ? room.hasKdv : true; _rent += Math.round(k ? b * 1.20 : b); });
                             const _monthsOwed = _rent > 0 ? Math.max(1, Math.round(_bal / _rent)) : 1;
                             const _pays = customer.payments || [];
                             let _msp = null;
                             if (_pays.length > 0) {
                                 const t = Math.max(..._pays.map(p => new Date(p.date).getTime()).filter(x => !isNaN(x)));
                                 if (isFinite(t)) { const d = new Date(t); const n = new Date(); _msp = (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth()); if (_msp < 0) _msp = 0; }
                             }
                             return (
                                 <div className="flex flex-wrap items-center gap-2 mb-3">
                                     {_msp === null ? (
                                         <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5"><History size={13}/> Hiç tahsilat yok</span>
                                     ) : _msp >= 1 ? (
                                         <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5"><History size={13}/> {_msp} aydır tahsilat yok</span>
                                     ) : null}
                                     {_monthsOwed > 0 && (
                                         <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1.5"><AlertCircle size={13}/> {_monthsOwed} aylık borcu var</span>
                                     )}
                                 </div>
                             );
                         })()}
                         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                             <div className="flex items-center gap-4">
                                 <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><History size={16} /> Detaylı Cari Hesap Dökümü (Ekstre)</h4>
                                 <select value={ledgerFilterYear} onChange={(e) => setLedgerFilterYear(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-600 focus:outline-none focus:border-indigo-400 cursor-pointer bg-white">
                                     <option value="all">Tüm Zamanlar</option>
                                     {availableYears.map(y => <option key={y} value={y.toString()}>{y} Yılı</option>)}
                                 </select>
                             </div>
                             <div className="flex flex-wrap items-center gap-2">
                                 {/* YENİ: Genel faiz durumu bilgisi — ayarlardan faiz aktifse tüm müşterilerde geçerlidir */}
                                 {collectionRates.isInterestActive ? (
                                     <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1.5"><Check size={13} strokeWidth={3}/> Tüm Müşterilerde Faiz Aktif Edildi</span>
                                 ) : (
                                     <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200 flex items-center gap-1.5">Genel Faiz Pasif</span>
                                 )}
                                 {/* GÜNCELLENDİ: Kişiye Özel Faiz Pasife Alma / Devam Ettirme Butonu.
                                     "Faizi Pasife Al" → bu müşterinin TÜM faizleri caridende kaldırılır ve yeni faiz işlemez.
                                     "Faize Devam Et" → hiç pasife alınmamış gibi tüm faizler geri hesaplanır ve işlemeye devam eder.
                                     Buton metni müşterinin mevcut durumuna göre otomatik değişir; genel ayardan bağımsız,
                                     tek müşteriyi ayırmak için kullanılır. */}
                                 <button onClick={async () => { if(!checkActionPerm('action-faiz-pasif')) return;
                                     const newExemptStatus = !customer.isInterestExempt;
                                     // Yerel state ANINDA güncellenir (önizlemede de çalışır, cari anında yeniden hesaplanır)
                                     setCustomers(prev => prev.map(c => String(c.id) === String(customer.id) ? { ...c, isInterestExempt: newExemptStatus } : c));
                                     if (db && firebaseUser) {
                                         try {
                                             await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'customers', String(customer.id)), {
                                                 isInterestExempt: newExemptStatus
                                             }, { merge: true });
                                         } catch(e) { console.error("Faiz Güncelleme Hatası:", e); }
                                     }
                                 }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm border ${customer.isInterestExempt ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}>
                                     <TrendingUp size={14}/> {customer.isInterestExempt ? 'Faize Devam Et' : 'Faizi Pasife Al'}
                                 </button>
                                 
                                 <button onClick={() => { if(!checkActionPerm('action-cari-duzenle')) return; setIsEditLedgerListModalOpen(true); }} className="bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm">
                                     <Settings size={14}/> Cari Düzenleme
                                 </button>
                                 <button onClick={() => { if(!checkActionPerm('action-cari-odeme-ekle')) return; setIsAddDebtModalOpen(true); }} className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm">
                                     <Plus size={14}/> Cari Ödeme (Borç) Ekle
                                 </button>
                                 <button onClick={() => { if(!checkActionPerm('action-cari-odeme-yap')) return; setIsAddPaymentModalOpen(true); }} className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm">
                                     <Wallet size={14}/> Cari Ödeme Yap
                                 </button>
                             </div>
                         </div>
                         <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                               <table className="w-full text-left text-sm text-gray-600">
                                  <thead className="bg-slate-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold">
                                     <tr>
                                        <th className="px-6 py-4">Tarih</th>
                                        <th className="px-6 py-4">İşlem Açıklaması</th>
<th className="px-6 py-4 text-right">Borç (Tahakkuk)</th>
                                        <th className="px-6 py-4 text-right">+ KDV %20 Tutarı</th>
                                        <th className="px-6 py-4 text-right">KDV Dahil Tutar</th>
                                        <th className="px-6 py-4 text-right">Alacak (Ödenen)</th>
                                        <th className="px-6 py-4 text-right">Bakiye</th>
                                     </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                     {filteredLedger.length > 0 ? filteredLedger.map((tx) => (
                                        <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${tx.needsConfirm ? 'opacity-70 bg-amber-50/50' : ''}`}>
                                           <td className="px-6 py-3 whitespace-nowrap font-medium">{tx.dateStr}</td>
                                           <td className="px-6 py-3">
                                              {tx.desc}
                                              {tx.needsConfirm && (
                                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                   <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Aynı gün / aynı tutar — onay bekliyor (bakiyeye işlenmedi)</span>
                                                   <button onClick={() => handleConfirmPendingPayment(tx.payId)} className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-md transition-colors"><Check size={11}/> Onayla</button>
                                                   <button onClick={() => handleDeletePendingPayment(tx.payId)} className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-md transition-colors"><Trash2 size={11}/> Sil</button>
                                                   <button onClick={() => handleSendPendingPaymentToAskida(tx.payId)} className="flex items-center gap-1 bg-slate-500 hover:bg-slate-600 text-white text-[10px] font-bold px-2 py-1 rounded-md transition-colors"><Clock size={11}/> Askıya Gönder</button>
                                                </div>
                                              )}
                                           </td>
<td className="px-6 py-3 text-right font-semibold text-red-500">{tx.debt > 0 ? `${(tx.baseDebt || 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL` : '-'}</td>
                                           <td className="px-6 py-3 text-right font-semibold text-orange-500">{tx.debt > 0 ? `${(tx.kdvDebt || 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL` : '-'}</td>
                                           <td className="px-6 py-3 text-right font-black text-indigo-600">{tx.debt > 0 ? `${tx.debt.toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL` : '-'}</td>
                                           <td className="px-6 py-3 text-right font-semibold text-green-600">{tx.needsConfirm ? <span className="text-amber-500 italic">{(tx.pendingAmount || 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL <span className="text-[10px] not-italic">(onay bekliyor)</span></span> : (tx.credit > 0 ? `${tx.credit.toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL` : '-')}</td>                                           <td className="px-6 py-3 text-right">
                                               <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black border shadow-sm ${tx.balance > 0 ? 'bg-red-50 text-red-700 border-red-200' : tx.balance < 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                   {tx.balance.toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL
                                               </span>
                                           </td>
                                        </tr>
                                     )) : (
                                        <tr>
                                           <td colSpan="6" className="px-6 py-8 text-center text-gray-400 font-medium">Bu döneme ait herhangi bir hesap hareketi bulunamadı.</td>
                                        </tr>
                                     )}
                                  </tbody>
                                  {filteredLedger.length > 0 && (
                                     <tfoot className="bg-gray-50 border-t border-gray-200 font-bold text-gray-800">
                                        <tr>
                                           <td colSpan="2" className="px-6 py-4 text-right">DÖNEM TOPLAMI / GÜNCEL BAKİYE:</td>
<td className="px-6 py-4 text-right text-red-600">{filteredLedger.reduce((sum, tx) => sum + (tx.baseDebt || 0), 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL</td>
                                           <td className="px-6 py-4 text-right text-orange-600">{filteredLedger.reduce((sum, tx) => sum + (tx.kdvDebt || 0), 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL</td>
                                           <td className="px-6 py-4 text-right font-black text-indigo-700">{filteredLedger.reduce((sum, tx) => sum + (tx.debt || 0), 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL</td>
                                           <td className="px-6 py-4 text-right text-green-600">{filteredLedger.reduce((sum, tx) => sum + tx.credit, 0).toLocaleString('tr-TR', {maximumFractionDigits: 0})} TL</td>                                           <td className="px-6 py-4 text-right">
                                               <span className={`inline-block px-3 py-1.5 rounded-lg text-sm font-black text-white shadow-md ${runningBalance > 0 ? 'bg-red-500 shadow-red-500/30' : runningBalance < 0 ? 'bg-green-500 shadow-green-500/30' : 'bg-slate-600 shadow-slate-500/30'}`}>
                                                   {runningBalance.toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL
                                               </span>
                                               {/* YENİ: Güncel bakiyeye DAHİL faiz toplamı. Faiz mantığı gereği yalnızca SON TAHSİLATTAN
                                                   SONRA doğan faizler üretilir (tam/kısmi tahsilat yapıldıkça öncekiler sayılmaz; faiz
                                                   pasifken hiç üretilmez). Faiz yoksa bu satır görünmez. */}
                                               {(() => {
                                                   if (runningBalance <= 0) return null;
                                                   const _intTotal = (getCustomerLedger(customer).ledger || []).reduce((s, t) => s + (t.isInterest ? (Number(t.debt) || 0) : 0), 0);
                                                   if (_intTotal <= 0) return null;
                                                   return <span className="block mt-1.5 text-[10px] font-bold text-rose-500">{Math.round(_intTotal).toLocaleString('tr-TR')} TL faiz dahildir</span>;
                                               })()}
                                           </td>
                                        </tr>
                                     </tfoot>
                                  )}
                               </table>
                            </div>
                            
                            {/* YENİ EKLENEN İŞLEM BUTONLARI */}
                            {filteredLedger.length > 0 && (
                                <div className="bg-white border-t border-gray-200 p-4 rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <button onClick={() => handlePrintLedger(customer, filteredLedger, runningBalance, ledgerFilterYear)} className="w-full sm:w-auto bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm">
                                        <Download size={18} /> Dökümü PDF İndir / Paylaş
                                    </button>
                                    
                                    <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
                                        <button onClick={() => handleOpenMessageModal(customer, runningBalance, 'reminder')} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm shadow-blue-500/30 flex-1 sm:flex-none justify-center">
                                            <MessageCircle size={16} /> Ödeme Hatırlat
                                        </button>
                                        <button onClick={() => handleOpenMessageModal(customer, runningBalance, 'warning')} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/30 flex-1 sm:flex-none justify-center">
                                            <AlertCircle size={16} /> Uyarı
                                        </button>
                                        <button onClick={() => handleOpenMessageModal(customer, runningBalance, 'eviction')} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm shadow-red-500/30 w-full sm:w-auto justify-center mt-1 sm:mt-0">
                                            <Trash2 size={16} /> Tahliye İhtarı
                                        </button>
                                    </div>
                                </div>
                            )}

                         </div>
                      </div>

                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-4">Aktif Kiralama Yaptığı Odalar</h4>
                      
                      {customerRooms.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                           {customerRooms.map((room) => {
                             const customer = customers.find(c => c.name === room.customerName);
                             const overrides = customer?.ledgerOverrides || [];

const entryDate = parseDateLocal(room.entryDate || '2026-01-01');
                             const paymentAnchorDate = room.paymentDate && room.paymentDate.includes('-') ? parseDateLocal(room.paymentDate) : entryDate;
                             const today = new Date(); today.setHours(23, 59, 59, 999);
                             const baseAmount = getRoomLatestFee(room);
                             const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
                             // ═══════════════════════════════════════════════════════════════
                             // GÜNCELLENDİ: "Aylık Kira Bedeli" artık HESAPLANMAZ, doğrudan
                             // MÜŞTERİNİN CARİSİNDEN OKUNUR — böylece cari ekstre ile birebir
                             // aynı olması yapısal olarak garantidir (net/brüt tahminine son).
                             // Kaynak adayları (KDV DAHİL tutarlar):
                             //   1) Carideki bu odaya ait EN SON gerçek kira borç satırı
                             //      (Hediye/Faiz satırları atlanır)
                             //   2) Bu odaya ait zam override kayıtları (zam yapılır yapılmaz
                             //      cariye yazıldığı için, "Senesi Dolan Odalar"da zam yapıldığı
                             //      ANDA kart da güncellenir — ay vadesi beklenmez)
                             // En GÜNCEL AYA ait olan kazanır; aynı aydaysa yüksek tutar alınır.
                             // ═══════════════════════════════════════════════════════════════
                             let monthlyTotal = getRoomLatestGrossFee(room); // hiç kayıt yoksa güvenli varsayılan
                             try {
                                 let bestIdx = -1; let bestGross = 0;
                                 const roomTag = `${room.name} Odası`;
                                 // 1) Cari satırları
                                 const { ledger: fullLedger } = getCustomerLedger(customer) || {};
                                 (Array.isArray(fullLedger) ? fullLedger : []).forEach(tx => {
                                     const g = Number(tx?.debt) || 0;
                                     const ds = String(tx?.desc || '');
                                     if (g <= 0 || !ds.startsWith(roomTag)) return;
                                     if (ds.includes('Hediye') || ds.includes('Faiz')) return;
                                     const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
                                     if (isNaN(d.getTime())) return;
                                     const idx = d.getFullYear() * 12 + d.getMonth();
                                     if (idx > bestIdx || (idx === bestIdx && g > bestGross)) { bestIdx = idx; bestGross = g; }
                                 });
                                 // 2) Zam override kayıtları (txId: debt-{odaId}-{yıl}-{ay})
                                 (overrides || []).forEach(o => {
                                     if (!o || o.isDeleted || o.isSpecificGift) return;
                                     const g = Number(o.debt) || 0;
                                     if (g <= 0 || String(o.desc || '').includes('Hediye')) return;
                                     if (!String(o.txId || '').startsWith(`debt-${room.id}-`)) return;
                                     const p = String(o.txId).slice(`debt-${room.id}-`.length).split('-');
                                     const idx = parseInt(p[0]) * 12 + parseInt(p[1]);
                                     if (isNaN(idx)) return;
                                     if (idx > bestIdx || (idx === bestIdx && g > bestGross)) { bestIdx = idx; bestGross = g; }
                                 });
                                 if (bestGross > 0) monthlyTotal = Math.round(bestGross);
                             } catch (e) { console.error('Aylık kira bedeli cariden okunamadı:', e); }

                             return (
                               <div key={room.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
                                  <div className="absolute top-0 right-0 p-3"><span className="bg-cyan-50 text-cyan-600 px-3 py-1 rounded-full text-[10px] font-bold border border-cyan-100 uppercase">Aktif Kiralama</span></div>
                                  <div className="flex items-center gap-3 mb-4">
                                     <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400"><Box size={20}/></div>
                                     <div><h5 className="font-bold text-gray-800 text-lg">{room.name}</h5><p className="text-xs text-gray-500 font-medium">Giriş: {room.entryDate} • {displayRoomM3(room)} m³</p></div>
                                  </div>
                                  <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100 flex flex-col gap-2">
                                     <div className="flex justify-between items-center"><span className="text-xs text-gray-500 font-semibold">Aylık Kira Bedeli:</span><span className="text-sm font-bold text-gray-700">{Math.round(monthlyTotal).toLocaleString('tr-TR')} TL {hasKdv && <span className="text-[9px] text-gray-400 font-normal">(KDV Dahil)</span>}</span></div>
                                  </div>
                                  <div className="flex items-center justify-end pt-2 mt-auto">
                                     <button onClick={() => { setActiveMenu('depo'); setSelectedWarehouseId(blocks.find(b => b.id === room.blockId)?.warehouseId); setSelectedBlockId(room.blockId); setSelectedRoomId(room.id); setSelectedCustomerId(null); }} className="bg-gray-800 hover:bg-gray-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5">Odaya Git &rarr;</button>
                                  </div>
                               </div>
                             );
                           })}
                        </div>
                      ) : (
                        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                           <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3"><Box size={24} className="text-gray-300" /></div>
                           <h3 className="text-base font-bold text-gray-700 mb-1">Aktif Kiralama Yok</h3>
                           <p className="font-medium text-sm text-gray-400">Bu müşterinin şu anda üzerine kayıtlı herhangi bir deposu/odası bulunmuyor.</p>
                        </div>
                      )}

                    </div>
                  );
               })()}
            </div>
      )}

      {/* MÜŞTERİ SİL ONAY MODALI */}
      {isDeleteCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                 <h3 className="text-xl font-bold text-red-600 mx-auto w-full text-center">Müşteriyi Kalıcı Olarak Sil</h3>
                 <button onClick={() => { setIsDeleteCustomerModalOpen(false); setCustomerToDeleteId(null); }} className="absolute right-5 text-gray-400 hover:text-red-500"><X size={20} /></button>
             </div>
             <div className="p-6 text-center">
                <div className="mx-auto bg-red-50 text-red-500 w-16 h-16 flex items-center justify-center rounded-full mb-4"><AlertCircle size={32} /></div>
                <p className="text-gray-700 font-bold mb-2">Bu müşteriyi silmek istediğinizden emin misiniz?</p>
                <p className="text-gray-500 text-sm mb-6">Müşteriye ait profil bilgileri, odalardaki aktif kayıtları ve cari geçmişi tamamen silinecektir. Bu işlem geri alınamaz!</p>
                <div className="flex justify-center gap-3">
                    <button onClick={() => { setIsDeleteCustomerModalOpen(false); setCustomerToDeleteId(null); }} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2.5 rounded-lg font-bold transition-colors text-sm w-1/2">Hayır, İptal Et</button>
                    <button onClick={() => {
                        handleDeleteCustomer(customerToDeleteId);
                    }} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm w-1/2 shadow-lg shadow-red-500/30"><Trash2 size={16} /> Evet, Sil</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* FATURALAR MODALI */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-cyan-600 flex items-center gap-2"><FileTextIcon size={20} /> Müşteri Faturaları / Belgeleri</h3>
                 <button onClick={() => setIsInvoiceModalOpen(false)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-6 overflow-y-auto flex-1 bg-white">
                
                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4 mb-6">
                    <h4 className="text-xs font-bold text-cyan-800 uppercase mb-3">Yeni Fatura / Belge Ekle</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Tarih</label>
                            <input type="date" value={newInvoice.date} onChange={(e) => setNewInvoice({...newInvoice, date: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Fatura Görseli/PDF (Zorunlu)</label>
                            <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => { const file = e.target.files[0]; if(file) { const reader = new FileReader(); reader.onloadend = () => setNewInvoice({...newInvoice, file: reader.result}); reader.readAsDataURL(file); } else { setNewInvoice({...newInvoice, file: null}); } }} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100" />
                        </div>
                        <div className="sm:col-span-2 flex justify-end mt-1">
                            <button onClick={handleAddInvoice} disabled={!newInvoice.date || !newInvoice.file} className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors whitespace-nowrap">Ekle</button>
                        </div>
                    </div>
                </div>

                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Eklenen Faturalar / Belgeler</h4>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-700 text-xs">
                            <tr>
                                <th className="p-3">Tarih</th>
                                <th className="p-3 text-center">Dosya</th>
                                <th className="p-3 text-center">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const cust = customers.find(c => c.id === selectedCustomerId);
                                const invs = cust?.invoices || [];
                                if (invs.length === 0) return <tr><td colSpan="3" className="p-6 text-center text-gray-400">Henüz fatura veya belge eklenmemiş.</td></tr>;
                                return invs.map(inv => (
                                    <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="p-3 font-medium text-gray-800">{new Date(inv.date).toLocaleDateString('tr-TR')}</td>
                                        <td className="p-3 text-center">
                                            {inv.file ? <a href={inv.file} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline font-medium text-xs">İncele</a> : <span className="text-gray-400 text-xs">-</span>}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button onClick={() => handleDeleteInvoice(inv.id)} className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"><Trash2 size={16}/></button>
                                        </td>
                                    </tr>
                                ));
                            })()}
                        </tbody>
                    </table>
                </div>

             </div>
          </div>
        </div>
      )}

      {/* YENİ EKLENEN: MÜŞTERİ SÖZLEŞMELERİ MODALI */}
      {isContractsModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-violet-50 rounded-t-2xl">
                 <h3 className="text-lg font-bold text-violet-700 flex items-center gap-2"><FileTextIcon size={20} /> Müşteri Sözleşmeleri / Tutanakları</h3>
                 <button onClick={() => setIsContractsModalOpen(false)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-6 overflow-y-auto flex-1 bg-white">
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-6">
                    <h4 className="text-xs font-bold text-violet-800 uppercase mb-3">Yeni Sözleşme / Tutanak Ekle</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Belge Türü</label>
                            <select value={newContract.label} onChange={(e) => setNewContract({...newContract, label: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 bg-white">
                                <option>Kiralama Sözleşmesi</option>
                                <option>Giriş-Çıkış Tutanağı</option>
                                <option>Teslim Tutanağı</option>
                                <option>Nakliye Hasar Tutanağı</option>
                                <option>Sözleşme</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Tarih</label>
                            <input type="date" value={newContract.date} onChange={(e) => setNewContract({...newContract, date: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Dosya (Zorunlu)</label>
                            <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => { const files = Array.from(e.target.files || []); setNewContract(prev => ({...prev, files, file: files.length ? 'secildi' : null})); }} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100" />
                            {newContract.files && newContract.files.length > 1 && <p className="text-[10px] text-violet-500 font-bold mt-1">{newContract.files.length} dosya (sayfa) seçildi — hepsi eklenecek.</p>}
                        </div>
                        <div className="sm:col-span-3 flex justify-end mt-1">
                            <button onClick={handleAddContract} disabled={!newContract.date || !(newContract.files && newContract.files.length)} className="bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors whitespace-nowrap">Ekle</button>
                        </div>
                    </div>
                </div>

                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Eklenen Sözleşmeler / Tutanaklar</h4>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 border-b border-gray-200 font-bold text-gray-700 text-xs">
                            <tr><th className="p-3">Belge Türü</th><th className="p-3">Tarih</th><th className="p-3 text-center">Dosya</th><th className="p-3 text-center">İşlem</th></tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const cust = customers.find(c => c.id === selectedCustomerId);
                                const list = cust?.contracts || [];
                                if (list.length === 0) return <tr><td colSpan="4" className="p-6 text-center text-gray-400">Henüz sözleşme veya tutanak eklenmemiş.</td></tr>;
                                return [...list].sort((a,b) => b.id - a.id).map(item => (
                                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="p-3 font-semibold text-gray-800">{item.label || 'Sözleşme'}</td>
                                        <td className="p-3 font-medium text-gray-600">{new Date(item.date).toLocaleDateString('tr-TR')}</td>
                                        <td className="p-3 text-center">{item.file ? <a href={item.file} target="_blank" rel="noreferrer" className="text-violet-600 hover:underline font-medium text-xs">İncele</a> : <span className="text-gray-400 text-xs">-</span>}</td>
                                        <td className="p-3 text-center"><button onClick={() => handleDeleteContract(item.id)} className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"><Trash2 size={16}/></button></td>
                                    </tr>
                                ));
                            })()}
                        </tbody>
                    </table>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MÜŞTERİ DÜZENLE MODALI */}
      {isEditCustomerModalOpen && editCustomerData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 lg:p-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto relative animate-in fade-in zoom-in duration-200">
             <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-slate-50 rounded-t-2xl sticky top-0 z-10">
                 <h3 className="text-xl font-bold text-[#1bc5bd] flex items-center gap-2"><Edit size={22} /> Müşteri Bilgilerini Düzenle</h3>
                 <button onClick={() => setIsEditCustomerModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white p-1.5 rounded-full shadow-sm border border-gray-200"><X size={20} /></button>
             </div>
             <div className="p-6 md:p-8">
                <div className="flex gap-6 mb-8 pb-4 border-b border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer group"><input type="radio" name="editCustomerType" value="bireysel" checked={editCustomerData.type === 'bireysel'} onChange={() => setEditCustomerData({...editCustomerData, type: 'bireysel'})} className="w-5 h-5 text-red-500 border-gray-300 focus:ring-red-500"/><span className={`text-sm font-bold transition-colors ${editCustomerData.type === 'bireysel' ? 'text-slate-800' : 'text-gray-500'}`}>Bireysel Müşteri</span></label>
                  <label className="flex items-center gap-2 cursor-pointer group"><input type="radio" name="editCustomerType" value="kurumsal" checked={editCustomerData.type === 'kurumsal'} onChange={() => setEditCustomerData({...editCustomerData, type: 'kurumsal'})} className="w-5 h-5 text-red-500 border-gray-300 focus:ring-red-500"/><span className={`text-sm font-bold transition-colors ${editCustomerData.type === 'kurumsal' ? 'text-slate-800' : 'text-gray-500'}`}>Kurumsal Müşteri</span></label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-[#1bc5bd] uppercase tracking-wider">Müşteri Numarası</label>
                    <input type="text" readOnly value={editCustomerData.customerNo} className="border-2 border-[#1bc5bd]/20 bg-teal-50/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none font-semibold text-teal-700 cursor-not-allowed" />
                  </div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{editCustomerData.type === 'bireysel' ? 'Ad Soyad' : 'Firma Adı / Yetkili Kişi'}</label><input type="text" value={editCustomerData.name} onChange={(e) => setEditCustomerData({...editCustomerData, name: e.target.value})} placeholder={editCustomerData.type === 'bireysel' ? 'Ad Soyad' : 'Firma Adı'} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{editCustomerData.type === 'bireysel' ? 'TC Kimlik Numarası' : 'Vergi Numarası'}</label><input type="text" value={editCustomerData.tc} onChange={(e) => setEditCustomerData({...editCustomerData, tc: e.target.value})} placeholder={editCustomerData.type === 'bireysel' ? 'TC Kimlik No' : 'Vergi No'} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  {/* YENİ EKLENEN: Kurumsal müşteride Vergi Dairesi alanı */}
                  {editCustomerData.type === 'kurumsal' && (
                      <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Vergi Dairesi</label><input type="text" value={editCustomerData.taxOffice || ''} onChange={(e) => setEditCustomerData({...editCustomerData, taxOffice: e.target.value})} placeholder="Örn: Pendik Vergi Dairesi" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  )}
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Telefon Numarası</label><input type="text" value={editCustomerData.phone} onChange={(e) => setEditCustomerData({...editCustomerData, phone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Alternatif Telefon</label><input type="text" value={editCustomerData.altPhone} onChange={(e) => setEditCustomerData({...editCustomerData, altPhone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  {/* YENİ: E-Posta adresi düzenleme alanı (isteğe bağlı) */}
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">E-Posta Adresi</label><input type="email" value={editCustomerData.email || ''} onChange={(e) => setEditCustomerData({...editCustomerData, email: e.target.value})} placeholder="Örn: musteri@ornek.com" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  {/* YENİ EKLENEN: İl (seçilebilir, 81 il) ve İlçe (elle yazılabilir) — Bireysel ve Kurumsalda aynı */}
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">İl</label>
                      <select value={editCustomerData.city || 'İstanbul'} onChange={(e) => setEditCustomerData({...editCustomerData, city: e.target.value})} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700 bg-white">
                          {turkiyeIlleri.map(il => <option key={il} value={il}>{il}</option>)}
                      </select>
                  </div>
                  <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">İlçe</label><input type="text" value={editCustomerData.district || ''} onChange={(e) => setEditCustomerData({...editCustomerData, district: e.target.value})} placeholder="Örn: Pendik" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5 md:col-span-2"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Müşteri Adresi</label><input type="text" value={editCustomerData.address} onChange={(e) => setEditCustomerData({...editCustomerData, address: e.target.value})} placeholder="Tam Adres" className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1bc5bd] font-medium text-slate-700" /></div>
                  <div className="flex flex-col gap-1.5 md:col-span-2 mt-2">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{editCustomerData.type === 'bireysel' ? 'Kimlik Fotoğrafı (Ön ve Arka Yüz)' : 'Kurumsal Belgeler'}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* ÖN YÜZ DÜZENLE */}
                          <div className="flex flex-col gap-2">
                              <label className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer bg-slate-50 group h-full relative">
                                {editCustomerData.documentPhotoFront || editCustomerData.documentPhoto ? (
                                   <div className="flex flex-col items-center">
                                      <Check size={32} className="text-[#1bc5bd] mb-2" />
                                      <span className="text-sm font-bold text-teal-600">Ön Yüz Eklendi</span>
                                      <img src={editCustomerData.documentPhotoFront || editCustomerData.documentPhoto} alt="Ön Yüz" className="mt-4 h-24 object-contain rounded border border-gray-200" />
                                   </div>
                                ) : (
                                   <>
                                     <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Upload size={20} className="text-gray-400 group-hover:text-[#1bc5bd]" /></div>
                                     <p className="text-sm text-gray-600 mb-1 font-medium"><span className="text-[#1bc5bd]">{editCustomerData.type === 'bireysel' ? 'Ön Yüz Seç' : 'Belge 1 Seç'}</span></p>
                                   </>
                                )}
                                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const file = e.target.files[0]; if(file) { const url = await uploadImageToServer(file); setEditCustomerData({...editCustomerData, documentPhotoFront: url, documentPhoto: url}); } }} />
                              </label>
                              {(editCustomerData.documentPhotoFront || editCustomerData.documentPhoto) && (
                                  <div className="flex justify-center mt-1">
                                      <button type="button" onClick={(e) => { e.preventDefault(); setEditCustomerData({...editCustomerData, documentPhotoFront: null, documentPhoto: null}); }} className="text-xs font-bold text-red-500 hover:text-red-700">Ön Yüzü Kaldır</button>
                                  </div>
                              )}
                          </div>

                          {/* ARKA YÜZ DÜZENLE */}
                          <div className="flex flex-col gap-2">
                              <label className="border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer bg-slate-50 group h-full relative">
                                {editCustomerData.documentPhotoBack ? (
                                   <div className="flex flex-col items-center">
                                      <Check size={32} className="text-[#1bc5bd] mb-2" />
                                      <span className="text-sm font-bold text-teal-600">Arka Yüz Eklendi</span>
                                      <img src={editCustomerData.documentPhotoBack} alt="Arka Yüz" className="mt-4 h-24 object-contain rounded border border-gray-200" />
                                   </div>
                                ) : (
                                   <>
                                     <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Upload size={20} className="text-gray-400 group-hover:text-[#1bc5bd]" /></div>
                                     <p className="text-sm text-gray-600 mb-1 font-medium"><span className="text-[#1bc5bd]">{editCustomerData.type === 'bireysel' ? 'Arka Yüz Seç' : 'Belge 2 Seç'}</span></p>
                                   </>
                                )}
                                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const file = e.target.files[0]; if(file) { const url = await uploadImageToServer(file); setEditCustomerData({...editCustomerData, documentPhotoBack: url}); } }} />
                              </label>
                              {editCustomerData.documentPhotoBack && (
                                  <div className="flex justify-center mt-1">
                                      <button type="button" onClick={(e) => { e.preventDefault(); setEditCustomerData({...editCustomerData, documentPhotoBack: null}); }} className="text-xs font-bold text-red-500 hover:text-red-700">Arka Yüzü Kaldır</button>
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-2"><label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Özel Notlar</label><textarea value={editCustomerData.notes} onChange={(e) => setEditCustomerData({...editCustomerData, notes: e.target.value})} rows="3" className="border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1bc5bd] resize-none font-medium text-slate-700"></textarea></div>
                  
                  {/* DÜZENLEME EKRANI: VEKALET BİLGİLERİ */}
                  <div className="md:col-span-2 mt-4 border-t border-gray-100 pt-6">
                      <label className="flex items-center gap-3 cursor-pointer w-max group">
                          <div className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${editCustomerData.hasProxy ? 'bg-[#1bc5bd]' : 'bg-gray-300'}`} onClick={() => setEditCustomerData({...editCustomerData, hasProxy: !editCustomerData.hasProxy})}>
                              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${editCustomerData.hasProxy ? 'translate-x-6' : ''}`}></div>
                          </div>
                          <span className="font-bold text-gray-700 group-hover:text-[#1bc5bd] transition-colors">Vekalet Eden Bilgilerini Ekle / Düzenle</span>
                      </label>
                  </div>
                  
                  {editCustomerData.hasProxy && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 md:col-span-2 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 mt-2 animate-in fade-in slide-in-from-top-4">
                          <h4 className="md:col-span-2 font-bold text-indigo-800 border-b border-indigo-100 pb-3 flex items-center gap-2"><Shield size={18}/> Vekalet Eden Kişinin Bilgileri</h4>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Ad Soyad</label><input type="text" value={editCustomerData.proxyName || ''} onChange={(e) => setEditCustomerData({...editCustomerData, proxyName: e.target.value})} placeholder="Vekil Ad Soyad" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">TC Kimlik Numarası</label><input type="text" value={editCustomerData.proxyTc || ''} onChange={(e) => setEditCustomerData({...editCustomerData, proxyTc: e.target.value})} placeholder="Vekil TC Kimlik No" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Telefon Numarası</label><input type="text" value={editCustomerData.proxyPhone || ''} onChange={(e) => setEditCustomerData({...editCustomerData, proxyPhone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Yedek Telefon (İsteğe Bağlı)</label><input type="text" value={editCustomerData.proxyAltPhone || ''} onChange={(e) => setEditCustomerData({...editCustomerData, proxyAltPhone: e.target.value})} placeholder="Örn: 0555 555 55 55" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          <div className="flex flex-col gap-1.5 md:col-span-2"><label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Adres</label><input type="text" value={editCustomerData.proxyAddress || ''} onChange={(e) => setEditCustomerData({...editCustomerData, proxyAddress: e.target.value})} placeholder="Tam Adres" className="border-2 border-indigo-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-medium text-slate-700 bg-white" /></div>
                          
                          <div className="flex flex-col gap-1.5 md:col-span-2 mt-2">
                              <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Vekil Kimlik Fotoğrafı / Belgesi Yükle</label>
                              <label className="border-2 border-dashed border-indigo-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:bg-indigo-50 hover:border-indigo-400 transition-colors cursor-pointer bg-white group">
                                {editCustomerData.proxyDocumentPhoto ? (
                                   <div className="flex flex-col items-center">
                                      <Check size={32} className="text-indigo-500 mb-2" />
                                      <span className="text-sm font-bold text-indigo-600">Vekalet Belgesi Eklendi</span>
                                      <img src={editCustomerData.proxyDocumentPhoto} alt="Belge" className="mt-4 h-24 object-contain rounded border border-gray-200" />
                                   </div>
                                ) : (
                                   <>
                                     <div className="w-12 h-12 bg-indigo-50 rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Upload size={20} className="text-indigo-500" /></div>
                                     <p className="text-sm text-gray-600 mb-1 font-medium"><span className="text-indigo-600">Dosya seçmek için tıklayın</span> veya sürükleyip bırakın</p>
                                     <p className="text-xs text-gray-400">PNG, JPG veya PDF formatında yükleyebilirsiniz</p>
                                   </>
                                )}
<input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const file = e.target.files[0]; if(file) { const url = await uploadImageToServer(file); setEditCustomerData({...editCustomerData, proxyDocumentPhoto: url}); } }} />                              </label>
                              {editCustomerData.proxyDocumentPhoto && (
                                  <div className="flex justify-center mt-2">
                                      <button type="button" onClick={(e) => { e.preventDefault(); setEditCustomerData({...editCustomerData, proxyDocumentPhoto: null}); }} className="text-xs font-bold text-red-500 hover:text-red-700">Mevcut Vekil Belgesini Kaldır</button>
                                  </div>
                              )}

                              {/* ═══════════════════════════════════════════════════════
                                  YENİ EKLENEN: BİRDEN FAZLA VEKALET BELGESİ (DÜZENLEME)
                                  Mevcut tekli alan (proxyDocumentPhoto) AYNEN korunur;
                                  ek belgeler yeni "proxyDocumentPhotos" dizisinde tutulur.
                                  handleUpdateCustomer ...editCustomerData ile kaydettiği
                                  için dizi otomatik olarak Firebase'e de yazılır.
                                  ═══════════════════════════════════════════════════════ */}
                              <div className="mt-4 border-t border-indigo-100 pt-4">
                                  <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Ek Vekalet Belgeleri (Birden Fazla Eklenebilir)</label>
                                  {/* Eklenmiş ek belgelerin önizlemesi — her belge tek tek kaldırılabilir */}
                                  {(editCustomerData.proxyDocumentPhotos || []).length > 0 && (
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                          {(editCustomerData.proxyDocumentPhotos || []).map((docUrl, idx) => (
                                              <div key={idx} className="relative border border-indigo-200 rounded-xl p-2 bg-white shadow-sm flex flex-col items-center gap-1.5">
                                                  <a href={docUrl} target="_blank" rel="noreferrer"><img src={docUrl} alt={`Ek Vekalet Belgesi ${idx + 1}`} className="h-20 object-contain rounded" /></a>
                                                  <span className="text-[10px] font-bold text-indigo-500">Ek Belge {idx + 1}</span>
                                                  {/* Bu belgeyi diziden çıkar (diğer belgeler etkilenmez) */}
                                                  <button type="button" onClick={(e) => { e.preventDefault(); setEditCustomerData({ ...editCustomerData, proxyDocumentPhotos: (editCustomerData.proxyDocumentPhotos || []).filter((_, i) => i !== idx) }); }} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow" title="Bu belgeyi kaldır"><X size={14} /></button>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                                  {/* Çoklu dosya seçimi destekli yükleme alanı (multiple) */}
                                  <label className="mt-3 border-2 border-dashed border-indigo-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:bg-indigo-50 hover:border-indigo-400 transition-colors cursor-pointer bg-white group">
                                      <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm"><Plus size={16} /> Yeni Vekalet Belgesi Ekle</div>
                                      <p className="text-xs text-gray-400 mt-1">PNG, JPG veya PDF — aynı anda birden fazla dosya seçebilirsiniz</p>
                                      <input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={async (e) => { const files = Array.from(e.target.files || []); if (files.length === 0) return; const urls = []; for (const f of files) { const u = await uploadImageToServer(f); if (u) urls.push(u); } setEditCustomerData(prev => ({ ...prev, proxyDocumentPhotos: [...(prev.proxyDocumentPhotos || []), ...urls] })); e.target.value = ''; }} />
                                  </label>
                              </div>
                          </div>
                      </div>
                  )}

                </div>
                <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6">
                   <button onClick={() => setIsEditCustomerModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold transition-colors text-sm">İptal Et</button>
                   <button onClick={handleUpdateCustomer} disabled={!editCustomerData.name} className="bg-[#1bc5bd] hover:bg-teal-500 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shadow-teal-500/30"><Check strokeWidth={3} size={20} /> Değişiklikleri Kaydet</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MANUEL CARİ BORÇ EKLE MODALI */}
      {isAddDebtModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-red-50 rounded-t-xl">
                 <h3 className="text-lg font-bold text-red-600 flex items-center gap-2"><Plus size={18} /> Cari Ödeme (Borç) Ekle</h3>
                 <button onClick={() => setIsAddDebtModalOpen(false)}><X size={20} className="text-red-400 hover:text-red-600"/></button>
             </div>
             <div className="p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">Ödeme Bilgisi / Ne Borcu Olduğu</label>
                    <input type="text" value={newDebtData.desc} onChange={(e) => setNewDebtData({...newDebtData, desc: e.target.value})} placeholder="Örn: Ekstra Nakliye Hizmeti" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">Ödeme Tutarı (TL)</label>
                    <input type="number" value={newDebtData.amount} onChange={(e) => setNewDebtData({...newDebtData, amount: e.target.value})} placeholder="Örn: 1500" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 font-bold" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer mt-1">
                    <input type="checkbox" checked={newDebtData.hasKdv} onChange={(e) => setNewDebtData({...newDebtData, hasKdv: e.target.checked})} className="w-4 h-4 text-red-500 rounded focus:ring-red-500"/>
                    <span className="text-sm font-medium text-gray-700">+ %20 KDV Uygula</span>
                  </label>
                  {newDebtData.hasKdv && newDebtData.amount && (
                    <div className="text-[11px] font-bold text-red-600 bg-red-50 p-2 rounded">
                      Müşterinin carisine yansıyacak toplam tutar: {(Number(newDebtData.amount) * 1.2).toFixed(0)} TL
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-xs font-bold text-gray-600">Ödeme Cari Tarihi</label>
                    <input type="date" value={newDebtData.date} onChange={(e) => setNewDebtData({...newDebtData, date: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => setIsAddDebtModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold">İptal</button>
                  <button onClick={handleManualAddDebt} disabled={!newDebtData.desc || !newDebtData.amount} className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-sm">Cariye Ekle</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MANUEL CARİ ÖDEME YAP MODALI */}
      {isAddPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-green-50 rounded-t-xl">
                 <h3 className="text-lg font-bold text-green-700 flex items-center gap-2"><Wallet size={18} /> Cari Ödeme Yap (Tahsilat)</h3>
                 <button onClick={() => setIsAddPaymentModalOpen(false)}><X size={20} className="text-green-500 hover:text-green-700"/></button>
             </div>
             <div className="p-6">
                <div className="flex flex-col gap-4">
                  {/* YENİ EKLENEN: Kredi Kartıyla Tahsilat seçeneği */}
                  <label className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={newPaymentData.isCreditCard} onChange={(e) => setNewPaymentData({...newPaymentData, isCreditCard: e.target.checked})} className="w-4 h-4 accent-amber-500" />
                    <span className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><CreditCard size={14}/> Kredi Kartıyla Tahsilat</span>
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">{newPaymentData.isCreditCard ? 'Müşteriden Alınan Tutar (Cariye İşlenecek)' : 'Ödenen Tutar (TL)'}</label>
                    <input type="number" value={newPaymentData.amount} onChange={(e) => setNewPaymentData({...newPaymentData, amount: e.target.value})} placeholder="Örn: 30000" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 font-bold" />
                  </div>
                  {newPaymentData.isCreditCard && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-amber-700">Kesintili Tutar (Hesaba Geçen Net)</label>
                      <input type="number" value={newPaymentData.netAmount} onChange={(e) => setNewPaymentData({...newPaymentData, netAmount: e.target.value})} placeholder="Örn: 28450" className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 font-bold bg-amber-50/40" />
                      <span className="text-[10px] text-gray-400">Cariye <b>müşteriden alınan</b> tutar işlenir; rapora <b>kesintili</b> tutar yansır.</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">Ödeme Tarihi (Bankaya Gelişi)</label>
                    <input type="date" value={newPaymentData.date} onChange={(e) => setNewPaymentData({...newPaymentData, date: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">İşlem Açıklaması / Dekont Notu</label>
                    <textarea value={newPaymentData.note} onChange={(e) => setNewPaymentData({...newPaymentData, note: e.target.value})} rows="3" placeholder="Örn: Ekim 2026 Kirası" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"></textarea>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => setIsAddPaymentModalOpen(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold">İptal</button>
                  <button onClick={handleManualAddPayment} disabled={!newPaymentData.amount} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-sm">Tahsilatı İşle</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* CARİ LİSTE DÜZENLEME MODALI */}
      {isEditLedgerListModalOpen && selectedCustomerId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-orange-50 rounded-t-xl shrink-0">
                 <h3 className="text-lg font-bold text-orange-700 flex items-center gap-2"><Settings size={18} /> Cari İşlemleri Düzenle</h3>
                 <button onClick={() => setIsEditLedgerListModalOpen(false)}><X size={20} className="text-orange-500 hover:text-orange-700"/></button>
             </div>
             <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                <p className="text-sm font-medium text-gray-500 mb-4 text-center">Aşağıdaki listeden cari hareketleri silebilir veya tutar/tarih/açıklama bilgisini düzenleyebilirsiniz.</p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm text-gray-600">
                      <thead className="bg-gray-100 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold sticky top-0">
                         <tr>
                            <th className="px-4 py-3">Tarih</th>
                            <th className="px-4 py-3">Açıklama</th>
                            <th className="px-4 py-3 text-right">Borç (Tahakkuk)</th>
                            <th className="px-4 py-3 text-right">+ KDV Tutarı</th>
                            <th className="px-4 py-3 text-right">Alacak</th>
                            <th className="px-4 py-3 text-center w-24">İşlem</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                         {(() => {
                              const customer = customers.find(c => c.id === selectedCustomerId);
                              if (!customer) return null;
                              
                              const { ledger } = getCustomerLedger(customer);
                              const editableLedger = ledger;

                              if (editableLedger.length === 0) {
                                  return <tr><td colSpan="6" className="p-8 text-center text-gray-500">Düzenlenecek kayıt bulunmuyor.</td></tr>;
                              }

                              return editableLedger.map(tx => (
                                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-medium whitespace-nowrap">{tx.dateStr}</td>
                                    <td className="px-4 py-3">{tx.desc}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-red-500">{tx.debt > 0 ? `${(tx.baseDebt || 0).toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL` : '-'}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-orange-500">{tx.debt > 0 ? `${(tx.kdvDebt || 0).toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL` : '-'}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-green-600">{tx.credit > 0 ? `${tx.credit.toLocaleString('tr-TR', {minimumFractionDigits: 0, maximumFractionDigits: 0})} TL` : '-'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button onClick={() => {
                                                const d = new Date(tx.date);
                                                const editDateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
                                                setEditingLedgerItem({
                                                    id: tx.id,
                                                    editDate: editDateStr,
                                                    editDesc: tx.desc,
                                                    editAmount: tx.debt > 0 ? tx.debt : tx.credit,
                                                    isDebt: tx.debt > 0
                                                });
                                            }} className="bg-blue-50 hover:bg-blue-100 text-blue-600 p-1.5 rounded transition-colors" title="Düzenle"><Edit size={14}/></button>
                                            <button onClick={() => handleDeleteLedgerItem(tx.id)} className="bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded transition-colors" title="Kalıcı Sil"><Trash2 size={14}/></button>
                                        </div>
                                    </td>
                                </tr>
                              ));
                         })()}
                      </tbody>
                  </table>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* CARİ KALEM DÜZENLEME ALT MODALI */}
      {editingLedgerItem && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50 rounded-t-xl">
                 <h3 className="text-lg font-bold text-blue-700 flex items-center gap-2"><Edit size={18} /> Kaydı Düzenle</h3>
                 <button onClick={() => setEditingLedgerItem(null)}><X size={20} className="text-blue-500 hover:text-blue-700"/></button>
             </div>
             <div className="p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">İşlem Tarihi</label>
                    <input type="date" value={editingLedgerItem.editDate} onChange={(e) => setEditingLedgerItem({...editingLedgerItem, editDate: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">İşlem Açıklaması</label>
                    <textarea rows="2" value={editingLedgerItem.editDesc} onChange={(e) => setEditingLedgerItem({...editingLedgerItem, editDesc: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"></textarea>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">Tutar (TL) - {editingLedgerItem.isDebt ? 'Borç (Tahakkuk)' : 'Alacak (Tahsilat)'}</label>
                    <input type="number" value={editingLedgerItem.editAmount} onChange={(e) => setEditingLedgerItem({...editingLedgerItem, editAmount: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-bold" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => setEditingLedgerItem(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold">İptal</button>
                  <button onClick={handleSaveLedgerEdit} disabled={!editingLedgerItem.editAmount || !editingLedgerItem.editDesc} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-sm">Kaydet</button>
                </div>
             </div>
          </div>
        </div>
      )}
    </>
  );
}
