import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Box,
  CreditCard,
  Download,
  Gift,
  Home,
  Key,
  TrendingUp,
  UserCog,
  Wallet
} from 'lucide-react';

// Hediye ay kontrolü (App.jsx ile aynı, bağımsız kopya — birçok başka ekranda da kullanılıyor)
// YENİ (ÇOKLU KAMPANYA): Odanın TÜM hediye aralıklarını tek listede döndürür.
//  • Eski tekil hediye: giftMonths + giftStartMonthIndex (mevcut "Hediye Ay Ver" butonu) → korunur
//  • Kampanya hediyeleri: giftCampaigns = [{ id, name, startIndex, months, createdAt, createdBy }]
//    Aynı müşteri farklı kampanyalarda birden fazla kez hediye alabilir; her kampanya ayrı aralıktır.
const getGiftRanges = (roomLike) => {
    if (!roomLike) return [];
    const ranges = [];
    if (Number(roomLike.giftMonths) > 0) {
        ranges.push({ id: 'legacy', name: 'Hediye Ay', start: Number(roomLike.giftStartMonthIndex || 0), months: Number(roomLike.giftMonths) });
    }
    (Array.isArray(roomLike.giftCampaigns) ? roomLike.giftCampaigns : []).forEach(c => {
        if (c && Number(c.months) > 0) ranges.push({ id: c.id, name: c.name || 'Kampanya', start: Number(c.startIndex || 0), months: Number(c.months) });
    });
    return ranges;
};

// Odaya verilen TOPLAM hediye ay sayısı (tekil + tüm kampanyalar)
const getTotalGiftMonths = (roomLike) => getGiftRanges(roomLike).reduce((s, g) => s + g.months, 0);

// Hediye döneminin bittiği ay sayacı (döngülerin gelecekteki hediye aylarını da görmesi için)
const getGiftEndIndex = (roomLike) => getGiftRanges(roomLike).reduce((m, g) => Math.max(m, g.start + g.months), 0);

// GÜNCELLENDİ: Bu ay herhangi bir hediye aralığına (tekil VEYA kampanya) giriyor mu?
// İmza değişmedi → tüm mevcut çağrı noktaları (ledger, oda dökümü, raporlar) otomatik olarak kampanyaları da tanır.
const isGiftedMonth = (roomLike, monthCounter) => {
    return getGiftRanges(roomLike).some(g => monthCounter >= g.start && monthCounter < g.start + g.months);
};

// --- YENİ EKLENEN: Gelişmiş Finans Alan Grafiği Bileşeni ---
const FinansAreaChart = ({ data }) => {
  const maxVal = Math.max(...data.map(d => Math.max(d.gelen, d.gelecek, 10000))) * 1.1; // Biraz üst boşluk bırak
  const width = 800;
  const height = 300;
  const paddingX = 40;
  const paddingY = 40;
  
  const getX = (index) => paddingX + (index * ((width - paddingX * 2) / (Math.max(data.length - 1, 1))));
  const getY = (val) => height - paddingY - ((val / maxVal) * (height - paddingY * 2));

  // Gelen (Pembe/Kırmızı) Çizgi ve Alan
  const gelenPoints = data.map((d, i) => `${getX(i)},${getY(d.gelen)}`).join(' L ');
  const gelenArea = `M ${getX(0)},${height - paddingY} L ${gelenPoints} L ${getX(data.length - 1)},${height - paddingY} Z`;

  // Gelecek (Mavi) Çizgi ve Alan
  const gelecekPoints = data.map((d, i) => `${getX(i)},${getY(d.gelecek)}`).join(' L ');
  const gelecekArea = `M ${getX(0)},${height - paddingY} L ${gelecekPoints} L ${getX(data.length - 1)},${height - paddingY} Z`;

  // Y ekseni çizgileri (Grid)
  const gridLines = [];
  for (let i = 0; i <= 5; i++) {
      const y = height - paddingY - (i * ((height - paddingY * 2) / 5));
      const val = (maxVal / 5) * i;
      gridLines.push(
          <g key={`grid-${i}`}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={paddingX - 10} y={y + 4} fontSize="10" fill="#94a3b8" textAnchor="end">{val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : val >= 1000 ? (val/1000).toFixed(0) + 'B' : val}</text>
          </g>
      );
  }

  return (
    <div className="w-full overflow-x-auto overflow-y-hidden" style={{ minHeight: '350px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full min-w-[600px]">
            <defs>
                <linearGradient id="gelenGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.3"/>
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.01"/>
                </linearGradient>
                <linearGradient id="gelecekGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3"/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01"/>
                </linearGradient>
            </defs>
            
            {gridLines}
            
            {/* Alanlar */}
            <path d={gelecekArea} fill="url(#gelecekGradient)" />
            <path d={gelenArea} fill="url(#gelenGradient)" />
            
            {/* Çizgiler */}
            <path d={`M ${gelecekPoints}`} fill="none" stroke="#3b82f6" strokeWidth="2" />
            <path d={`M ${gelenPoints}`} fill="none" stroke="#f43f5e" strokeWidth="2" />

            {/* Noktalar ve X Ekseni Metinleri */}
            {data.map((d, i) => {
                const x = getX(i);
                const yGelen = getY(d.gelen);
                const yGelecek = getY(d.gelecek);
                return (
                    <g key={`point-${i}`}>
                        <text x={x} y={height - paddingY + 20} fontSize="11" fill="#64748b" textAnchor="middle" fontWeight="bold">{d.label}</text>
                        {d.gelecek > 0 && <circle cx={x} cy={yGelecek} r="4" fill="#white" stroke="#3b82f6" strokeWidth="2" />}
                        {d.gelen > 0 && <circle cx={x} cy={yGelen} r="4" fill="white" stroke="#f43f5e" strokeWidth="2" />}
                    </g>
                );
            })}
        </svg>
    </div>
  );
};
// --- SON ---

// ============================================================================
// FİNANS (FİNANS YÖNETİMİ) BİLEŞENİ
// App.jsx içindeki "Finans Rapor", "Depo Rapor" ve "Personel Rapor" ekranları
// buraya taşındı. Bu üç ekran salt-okunur analiz/rapor sayfalarıdır; herhangi
// bir modal veya veri yazma işlemi içermezler. İhtiyaç duyduğu paylaşılan
// veriyi ve yardımcı fonksiyonları props üzerinden alır.
// ============================================================================
export default function Finans(props) {
  const {
    activeMenu, setActiveMenu,
    setSelectedCustomerId,
    customers, rooms, warehouses, blocks,
    pendingCollections, systemUsers,
    getCustomerLedger,
    getRoomFeeForMonth, getRoomLatestFee,
    getWarehouseStats, getWarehouseOccupiedM3, getWarehouseCapacityM3,
    collectionRates,
    inDashboardRange, parseAnyDate, parseDateLocal,
  } = props;

  // --- FİNANS RAPOR STATE'LERİ ---
  const [finansReportFilter, setFinansReportFilter] = useState('month'); // today, week, month(Bu Ay), year, custom
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]); // YENİ
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);     // YENİ
  const [branchPaymentFilter, setBranchPaymentFilter] = useState('1'); // 1, 3, 6, 12, all
  const [avgRevenueBranchFilter, setAvgRevenueBranchFilter] = useState('all');
  const [avgRevenueYearFilter, setAvgRevenueYearFilter] = useState(new Date().getFullYear().toString());
  
  // --- YENİ: DEPO HAREKET RAPORU STATE'LERİ ---
  const [depoReportTimeFilter, setDepoReportTimeFilter] = useState('buay');
  const [depoReportWhFilter, setDepoReportWhFilter] = useState('all');
  // YENİ: KİRA HACMİ (CİRO) RAPORU filtreleri — üstteki oda adedi raporundan bağımsız çalışır,
  // böylece iki raporu farklı dönemler için yan yana karşılaştırabilirsiniz.
  const [hacimReportTimeFilter, setHacimReportTimeFilter] = useState('buay');
  const [hacimReportWhFilter, setHacimReportWhFilter] = useState('all');

  // Finans Rapor'daki "Hediye Ay Özeti" için zaman filtresi (today|week|month|year|all)
  const [giftReportRange, setGiftReportRange] = useState('month');
  // YENİ: Hediye Ay Özeti tablosunda tümünü göster/gizle
  const [giftShowAll, setGiftShowAll] = useState(false);

  // YENİ: Personel Rapor sayfası filtreleri
  const [personelReportRange, setPersonelReportRange] = useState('month'); // today|yesterday|week|month|year|all
  const [personelReportWarehouse, setPersonelReportWarehouse] = useState('all'); // 'all' veya warehouse id


  return (
    <>
      {activeMenu === 'finans-rapor' && (
             <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
               <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                 <div>
                   <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Finans Yönetimi</h1>
                   <h2 className="text-2xl font-bold text-slate-800">Finansal Raporlar ve Analizler</h2>
                   <p className="text-sm text-gray-500 mt-1">Sistemdeki tüm tahsilatların, bekleyen borçların ve depo doluluk oranlarının özeti.</p>
                 </div>
                 
                 <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
                     <div className="flex flex-wrap bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm w-full sm:w-auto">
                         <button onClick={() => setFinansReportFilter('today')} className={`px-4 py-2.5 text-sm font-bold transition-colors flex-1 sm:flex-none ${finansReportFilter === 'today' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Bugün</button>
                         <button onClick={() => setFinansReportFilter('week')} className={`px-4 py-2.5 text-sm font-bold border-l border-gray-200 transition-colors flex-1 sm:flex-none ${finansReportFilter === 'week' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Bu Hafta</button>
                         <button onClick={() => setFinansReportFilter('month')} className={`px-4 py-2.5 text-sm font-bold border-l border-gray-200 transition-colors flex-1 sm:flex-none ${finansReportFilter === 'month' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Bu Ay</button>
                         <button onClick={() => setFinansReportFilter('year')} className={`px-4 py-2.5 text-sm font-bold border-l border-gray-200 transition-colors flex-1 sm:flex-none ${finansReportFilter === 'year' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Bu Sene</button>
                         <button onClick={() => setFinansReportFilter('lastYear')} className={`px-4 py-2.5 text-sm font-bold border-l border-gray-200 transition-colors flex-1 sm:flex-none ${finansReportFilter === 'lastYear' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Geçen Sene</button>
                         <button onClick={() => setFinansReportFilter('all')} className={`px-4 py-2.5 text-sm font-bold border-l border-gray-200 transition-colors flex-1 sm:flex-none ${finansReportFilter === 'all' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Tümü</button>
                         <button onClick={() => setFinansReportFilter('custom')} className={`px-4 py-2.5 text-sm font-bold border-l border-gray-200 transition-colors flex-1 sm:flex-none ${finansReportFilter === 'custom' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Özel Tarih</button>
                     </div>
                     {finansReportFilter === 'custom' && (
                         <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm animate-in fade-in">
                             <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="border-none bg-gray-50 rounded px-2 py-1 text-xs font-bold text-gray-700 outline-none cursor-pointer" title="Başlangıç Tarihi" />
                             <span className="text-gray-400 font-bold">-</span>
                             <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="border-none bg-gray-50 rounded px-2 py-1 text-xs font-bold text-gray-700 outline-none cursor-pointer" title="Bitiş Tarihi" />
                         </div>
                     )}
                 </div>
               </div>

               {(() => {
                   let startD = new Date();
                   let endD = new Date();
                   endD.setHours(23, 59, 59, 999);
                   startD.setHours(0, 0, 0, 0);

                   if (finansReportFilter === 'today') {
                       // exactly today
                   } else if (finansReportFilter === 'week') {
                       startD.setDate(startD.getDate() - 7);
                   } else if (finansReportFilter === 'month') {
                       startD.setMonth(startD.getMonth() - 1);
                   } else if (finansReportFilter === 'year') {
                       startD = new Date(startD.getFullYear(), 0, 1);
                   } else if (finansReportFilter === 'lastYear') {
                       startD = new Date(startD.getFullYear() - 1, 0, 1);
                       endD = new Date(endD.getFullYear() - 1, 11, 31, 23, 59, 59);
                   } else if (finansReportFilter === 'custom') {
                       startD = new Date(customStartDate);
                       startD.setHours(0, 0, 0, 0);
                       endD = new Date(customEndDate);
                       endD.setHours(23, 59, 59, 999);
                   } else if (finansReportFilter === 'all') {
                       startD = new Date(2000, 0, 1);
                   }

                   let totalTahsilEdilen = 0;
                   let totalNakliyeTahsilati = 0; // YENİ: Nakliye için ayrı sayaç
                   let totalTahakkuk = 0;
                   // YENİ EKLENEN: Kredi kartı (net/kesintili) ve mühür ücreti ayrı toplamlar
                   let totalKrediKartiNet = 0;   // POS kesintisi sonrası hesaba geçen net
                   let totalKrediKartiBrut = 0;  // müşteriden alınan brüt (bilgi amaçlı)
                   let totalMuhurUcreti = 0;

                   customers.forEach(customer => {
                       const { ledger } = getCustomerLedger(customer);
                       // Kredi kartı ödemelerinin net tutarları ham payments'tan alınır (tarih filtreli)
                       (customer.payments || []).forEach(p => {
                           const pDate = new Date(p.date);
                           if (p.paymentMethod === 'creditCard' && pDate >= startD && pDate <= endD) {
                               totalKrediKartiNet += Number(p.netAmount != null ? p.netAmount : p.amount);
                               totalKrediKartiBrut += Number(p.grossAmount != null ? p.grossAmount : p.amount);
                           }
                       });
                       ledger.forEach(tx => {
                           if (tx.isDummy) return; 
                           const txDate = new Date(tx.date);
                           if (txDate >= startD && txDate <= endD) {
                               if (tx.credit) {
                                   const descLower = String(tx.desc || '').toLowerCase();
                                   // Kredi kartı tahsilatı → kira tahsilatına DAHİL EDİLMEZ (ayrı gösterilir)
                                   if (descLower.includes('kredi kart')) {
                                       // kredi kartı; kira tahsilatına eklenmez
                                   } else if (descLower.includes('nakliye') || descLower.includes('taşıma')) {
                                       // Nakliye tahsilatları kaldırıldı — hiçbir toplama dahil edilmez
                                   } else {
                                       totalTahsilEdilen += tx.credit;
                                   }
                               }
                               if (tx.debt) {
                                   totalTahakkuk += tx.debt;
                                   // Mühür ücreti tahakkuklarını ayrıca topla
                                   const dLower = String(tx.desc || '').toLowerCase();
                                   if (dLower.includes('mühür')) totalMuhurUcreti += tx.debt;
                               }
                           }
                       });
                   });

                   let totalBekleyen = 0;
                   let toplamTahsilat = 0;

                   if (finansReportFilter === 'all') {
                       let exactBalance = 0;
                       customers.forEach(c => {
                           const { balance } = getCustomerLedger(c);
                           if (balance > 0) exactBalance += balance;
                       });
                       totalBekleyen = exactBalance;
                       toplamTahsilat = totalTahsilEdilen + totalBekleyen;
                   } else {
                       totalBekleyen = Math.max(0, totalTahakkuk - totalTahsilEdilen);
                       toplamTahsilat = totalTahsilEdilen + totalBekleyen;
                   }

                   let totalAskida = 0;
                   let askidaCount = 0;
                   pendingCollections.forEach(p => {
                       const pDate = new Date(p.date);
                       if (pDate >= startD && pDate <= endD) {
                           totalAskida += Number(p.amount);
                           askidaCount++;
                       }
                   });

                   const monthsStr = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                   const currentYearForChart = startD.getFullYear() < 2010 ? new Date().getFullYear() : startD.getFullYear();

                   // YENİ: HEDİYE AY ÖZETİ HESABI
                   // Odalara verilen hediye aylarını (giftMonths + giftStartMonthIndex) tarar; her hediye ayının
                   // o aya geçerli kira bedeli (getRoomFeeForMonth, KDV dahil) karşılığını "vazgeçilen tutar" olarak toplar.
                   // Kendi zaman filtresi (giftReportRange) vardır: hediye ayının denk geldiği takvim tarihine göre süzülür.
                   const giftSummary = (() => {
                       let totalGiftValue = 0;   // hediye aylarının toplam kira karşılığı (KDV dahil)
                       let totalGiftMonths = 0;  // toplam hediye ay adedi
                       const roomSet = new Set(); // hediye verilen benzersiz oda sayısı
                       const detailRows = [];    // filtre ekranı için satırlar

                       rooms.forEach(room => {
                           // GÜNCELLENDİ: Tekil hediye + tüm kampanya hediyeleri
                           const _ranges = getGiftRanges(room);
                           const gm = getTotalGiftMonths(room);
                           if (gm <= 0 || !room.entryDate) return;
                           const entryD = parseAnyDate(room.entryDate);
                           if (!entryD) return;
                           const anchorD = room.paymentDate && String(room.paymentDate).includes('-') ? parseAnyDate(room.paymentDate) : entryD;
                           const startIdx = Number(room.giftStartMonthIndex || 0);
                           const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;

                           void startIdx;
                           const _counters = []; _ranges.forEach(g => { for (let k = 0; k < g.months; k++) _counters.push(g.start + k); });
                           for (const monthCounter of _counters) {
                               // Hediye ayının denk geldiği takvim tarihi (giriş/ödeme çapasından monthCounter kadar ay sonrası)
                               const giftDate = new Date(anchorD.getFullYear(), anchorD.getMonth() + monthCounter, 1);
                               if (!inDashboardRange(giftDate, giftReportRange)) continue;
                               const base = Number(getRoomFeeForMonth(room, giftDate.getFullYear(), giftDate.getMonth()) || room.monthlyFee || 0);
                               const total = hasKdv ? base * 1.20 : base;
                               totalGiftValue += total;
                               totalGiftMonths += 1;
                               roomSet.add(room.id);
                               detailRows.push({
                                   roomId: room.id,
                                   roomName: room.name,
                                   customerName: room.customerName || '-',
                                   monthLabel: `${monthsStr[giftDate.getMonth()]} ${giftDate.getFullYear()}`,
                                   dateObj: giftDate,
                                   amount: total
                               });
                           }
                       });
                       detailRows.sort((a, b) => b.dateObj - a.dateObj);
                       return { totalGiftValue, totalGiftMonths, roomCount: roomSet.size, detailRows };
                   })();

                   const chartData = monthsStr.map((m, idx) => {
                       let gelen = 0;
                       let aylikTahakkuk = 0;
                       
                       customers.forEach(c => {
                           const { ledger } = getCustomerLedger(c);
                           ledger.forEach(tx => {
                               if (tx.isDummy) return;
                               const d = new Date(tx.date);
                               if (d.getMonth() === idx && d.getFullYear() === currentYearForChart) {
                                   if (tx.credit) gelen += tx.credit;
                                   if (tx.debt) aylikTahakkuk += tx.debt;
                               }
                           });
                       });
                       
                       const bekleyen = Math.max(0, aylikTahakkuk - gelen);
                       
                       return { 
                           label: m, 
                           gelen: gelen, 
                           gelecek: bekleyen 
                       };
                   });

                   // --- Şube Bazlı Ödemeler Hesaplaması ---
                   const getBranchPayments = () => {
                       const today = new Date();
                       const branchStartD = new Date();
                       if (branchPaymentFilter !== 'all') {
                           branchStartD.setMonth(today.getMonth() - parseInt(branchPaymentFilter));
                       } else {
                           branchStartD.setFullYear(2000); 
                       }

                       return warehouses.map(wh => {
                           const whBlocks = blocks.filter(b => b.warehouseId === wh.id).map(b => b.id);
                           const whRooms = rooms.filter(r => whBlocks.includes(r.blockId) && r.customerName);
                           
                           let tahsil = 0;
                           let bekleyen = 0;

                           whRooms.forEach(room => {
                               const entryD = parseDateLocal(room.entryDate || '2026-01-01');
                               const paymentAnchorD = room.paymentDate && room.paymentDate.includes('-') ? parseDateLocal(room.paymentDate) : entryD;
                               const baseAmt = Number(room.monthlyFee || 0);
                               const hasKdv = room.hasKdv !== undefined ? room.hasKdv : true;
                               const monthlyTotal = hasKdv ? baseAmt * 1.20 : baseAmt;

                               let loopDate = new Date(paymentAnchorD);
                               let monthCounter = 0;
                               
                               while (loopDate <= today) {
                                   if (loopDate >= branchStartD) {
                                       const key = `${loopDate.getFullYear()}-${loopDate.getMonth()}`;
                                       const isGifted = isGiftedMonth(room, monthCounter);
                                       const isFree = room.isFreeRoom;
                                       // GÜNCELLENDİ: Borç, ödeme GÜNÜ GELİNCE (aynı gün) sayılır; 1 gün sonraya kaydırma kaldırıldı.
                                       let dueDate = new Date(loopDate.getFullYear(), loopDate.getMonth(), loopDate.getDate());
                                       dueDate.setHours(0, 0, 0, 0);
                                       const isDueYet = dueDate <= today;
                                       
                                       if (isDueYet && !isGifted && !isFree) {
                                           if (room.paidMonths?.includes(key)) {
                                               tahsil += monthlyTotal;
                                           } else {
                                               bekleyen += monthlyTotal;
                                           }
                                       }
                                   }
                                   loopDate.setMonth(loopDate.getMonth() + 1);
                                   monthCounter++;
                               }
                           });
                           return { id: wh.id, name: wh.name, tahsil, bekleyen };
                       }).sort((a, b) => (b.tahsil + b.bekleyen) - (a.tahsil + a.bekleyen));
                   };
                   const branchPaymentsData = getBranchPayments();

                   // --- Ortalama Ciro ve Artış Azalış Tablosu (Trend) Hesaplaması ---
                   const trendYear = parseInt(avgRevenueYearFilter);
                   const filteredWhIdsForAvg = avgRevenueBranchFilter === 'all' 
                       ? warehouses.map(w => w.id) 
                       : [parseInt(avgRevenueBranchFilter)];
                   const targetBlocksForAvg = blocks.filter(b => filteredWhIdsForAvg.includes(b.warehouseId)).map(b => b.id);

                   const yearlyTrendData = monthsStr.map((m, idx) => {
                       const monthEnd = new Date(trendYear, idx + 1, 0);
                       
                       let monthRevenue = 0;
                       let monthRoomsCount = 0;
                       let monthM3 = 0;
                       let activeBranches = new Set();
                       
                       rooms.forEach(r => {
                           if (!targetBlocksForAvg.includes(r.blockId)) return;
                           if (!r.customerName || !r.entryDate) return;
                           
                           const entryD = parseDateLocal(r.entryDate);
                           if (entryD <= monthEnd) {
                               monthRoomsCount++;
                               monthM3 += Number(r.m3 || 0);
                               const baseAmt = Number(r.monthlyFee || 0);
                               const monthlyTotal = (r.hasKdv !== undefined ? r.hasKdv : true) ? baseAmt * 1.20 : baseAmt;
                               monthRevenue += monthlyTotal;
                               const whId = blocks.find(b => b.id === r.blockId)?.warehouseId;
                               if (whId) activeBranches.add(whId);
                           }
                       });

                       const odaBasi = monthRoomsCount > 0 ? (monthRevenue / monthRoomsCount) : 0;
                       const m3Basi = monthM3 > 0 ? (monthRevenue / monthM3) : 0;
                       const subeBasi = activeBranches.size > 0 ? (monthRevenue / activeBranches.size) : 0;

                       return {
                           month: m,
                           revenue: monthRevenue,
                           rooms: monthRoomsCount,
                           m3: monthM3,
                           odaBasi,
                           m3Basi,
                           subeBasi
                       };
                   });

                   // Genel Ortalamalar (İçinde bulunulan yıl ise mevcut ay, geçmiş yıl ise Aralık ayı baz alınır)
                   const targetMonthIndex = trendYear === new Date().getFullYear() ? new Date().getMonth() : 11;
                   const currentMonthData = yearlyTrendData[targetMonthIndex] || yearlyTrendData[0];

                   // YENİ: Bekleyen tahsilatın MEVCUT ODA / İCRA ODASI ayrımı.
                   // Cari bakiyesi borçlu olan her müşteri, icra sürecinde odası olup olmamasına göre iki gruba ayrılır.
                   let bekleyenIcra = 0, bekleyenMevcut = 0;
                   customers.forEach(c => {
                       try {
                           const { balance } = getCustomerLedger(c);
                           if (balance > 0) {
                               const hasLegalRoom = rooms.some(r => r.customerName === c.name && r.isUnderLegalAction);
                               if (hasLegalRoom) bekleyenIcra += balance; else bekleyenMevcut += balance;
                           }
                       } catch (e) { /* hesap hatasında müşteri atlanır */ }
                   });

                   return (
                       <div className="flex flex-col gap-6 pb-10">
                           
                           {/* ÖZET KARTLARI */}
                           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Kira Tahsilatı</h3>
                                   <div className="text-3xl font-extrabold text-[#1bc5bd]">{totalTahsilEdilen.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">Net kira tahsilatı</p>
                               </div>
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Bekleyen Tahsilat</h3>
                                   <div className="text-3xl font-extrabold text-orange-500">{totalBekleyen.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">Müşterilerin borcu olan kısım</p>
                               </div>
                               {/* YENİ: Bekleyen tahsilat ayrımı — mevcut oda / icra odası */}
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-blue-500 uppercase tracking-wider mb-2">Mevcut Odasında Tahsilat Bekleyenler</h3>
                                   <div className="text-3xl font-extrabold text-blue-500">{Math.round(bekleyenMevcut).toLocaleString('tr-TR')} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">İcrada olmayan müşterilerin cari borcu</p>
                               </div>
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-2">İcra Odasında Tahsilat Bekleyen</h3>
                                   <div className="text-3xl font-extrabold text-red-500">{Math.round(bekleyenIcra).toLocaleString('tr-TR')} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">İcra sürecindeki müşterilerin cari borcu</p>
                               </div>
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Toplam Tahsilat</h3>
                                   <div className="text-3xl font-extrabold text-indigo-500">{totalTahsilEdilen.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">Toplam alınan kira tahsilatı</p>
                               </div>
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Askıda Ödemeler</h3>
                                   <div className="text-3xl font-extrabold text-gray-700">{totalAskida.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">{askidaCount} kayıt eşleşmeyi bekliyor</p>
                               </div>
                               {/* YENİ EKLENEN: Kredi Kartı Tahsilatları (kesintili/net toplam) */}
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><CreditCard size={13}/> Kredi Kartı Tahsilatları</h3>
                                   <div className="text-3xl font-extrabold text-amber-500">{totalKrediKartiNet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">Kesintili (hesaba geçen) net toplam{totalKrediKartiBrut > 0 ? ` • Brüt: ${totalKrediKartiBrut.toLocaleString('tr-TR', {maximumFractionDigits:0})} ₺` : ''}</p>
                               </div>
                               {/* YENİ EKLENEN: Mühür Ücretleri (ayrı toplam) */}
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-2">Mühür Ücretleri</h3>
                                   <div className="text-3xl font-extrabold text-blue-500">{totalMuhurUcreti.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">Mühür değiştirme ücretleri toplamı</p>
                               </div>
                               {/* YENİ: Toplam Faizler — tüm müşterilerin carisine işlenmiş ekstra gecikme faizlerinin toplamı */}
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-rose-100 flex flex-col justify-center">
                                   <h3 className="text-[11px] font-bold text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><TrendingUp size={13}/> Toplam Faizler</h3>
                                   <div className="text-3xl font-extrabold text-rose-500">{(() => { let t = 0; try { customers.forEach(c => { (getCustomerLedger(c).ledger || []).forEach(l => { if (l.isInterest) t += Number(l.debt) || 0; }); }); } catch (e) { /* yoksay */ } return Math.round(t).toLocaleString('tr-TR'); })()} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2">Carilere işlenmiş ekstra gecikme faizleri toplamı{collectionRates.isInterestActive ? '' : ' (faiz şu an pasif)'}</p>
                               </div>
                           </div>

                           {/* YENİ EKLENEN: HEDİYE AY ÖZETİ — verilen hediye aylarının toplamı, adedi ve zaman filtresi */}
                           <div className="bg-white rounded-2xl shadow-sm border border-pink-100 p-6 mb-6">
                               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-gray-100 pb-4">
                                   <div className="flex items-center gap-3">
                                       <div className="p-2.5 rounded-xl bg-pink-50 text-pink-500"><Gift size={20} /></div>
                                       <div>
                                           <h3 className="text-lg font-bold text-gray-800">Hediye Ay Özeti</h3>
                                           <p className="text-xs text-gray-400 mt-0.5">Odalara verilen hediye aylarının toplam karşılığı ve dağılımı</p>
                                       </div>
                                   </div>
                                   {/* Kendi zaman filtresi — hediye ayının denk geldiği tarihe göre süzer */}
                                   <div className="flex flex-wrap gap-1.5">
                                       {[['today','Bugün'],['week','Bu Hafta'],['month','Bu Ay'],['year','Bu Sene'],['all','Tümü']].map(([val,label]) => (
                                           <button key={val} onClick={() => setGiftReportRange(val)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm ${giftReportRange === val ? 'bg-pink-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>{label}</button>
                                       ))}
                                   </div>
                               </div>

                               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                                   <div className="bg-pink-50/40 rounded-xl p-5 border border-pink-100">
                                       <h4 className="text-[11px] font-bold text-pink-600 uppercase tracking-wider mb-2">Toplam Hediye Değeri</h4>
                                       <div className="text-3xl font-extrabold text-pink-500">{giftSummary.totalGiftValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                       <p className="text-[10px] font-medium text-gray-400 mt-2">Hediye edilen ayların kira karşılığı (KDV dahil)</p>
                                   </div>
                                   <div className="bg-purple-50/40 rounded-xl p-5 border border-purple-100">
                                       <h4 className="text-[11px] font-bold text-purple-600 uppercase tracking-wider mb-2">Toplam Hediye Ay</h4>
                                       <div className="text-3xl font-extrabold text-purple-500">{giftSummary.totalGiftMonths} <span className="text-lg">ay</span></div>
                                       <p className="text-[10px] font-medium text-gray-400 mt-2">Seçili dönemde verilen toplam hediye ay adedi</p>
                                   </div>
                                   <div className="bg-indigo-50/40 rounded-xl p-5 border border-indigo-100">
                                       <h4 className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Hediye Verilen Oda</h4>
                                       <div className="text-3xl font-extrabold text-indigo-500">{giftSummary.roomCount} <span className="text-lg">oda</span></div>
                                       <p className="text-[10px] font-medium text-gray-400 mt-2">Hediye ay uygulanan benzersiz oda sayısı</p>
                                   </div>
                               </div>

                               {/* Hediye ay dağılım listesi (filtreli) */}
                               {giftSummary.detailRows.length > 0 ? (
                                   <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                       <table className="w-full text-left text-sm">
                                           <thead className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase text-gray-500 font-bold">
                                               <tr>
                                                   <th className="px-4 py-3">Oda</th>
                                                   <th className="px-4 py-3">Müşteri</th>
                                                   <th className="px-4 py-3">Hediye Ayı</th>
                                                   <th className="px-4 py-3 text-right">Kira Karşılığı</th>
                                               </tr>
                                           </thead>
                                           <tbody className="divide-y divide-gray-50">
                                               {(giftShowAll ? giftSummary.detailRows : giftSummary.detailRows.slice(0, 10)).map((row, i) => (
                                                   <tr key={`${row.roomId}-${i}`} className="hover:bg-pink-50/30 transition-colors">
                                                       <td className="px-4 py-3 font-bold text-gray-700">{row.roomName}</td>
                                                       <td className="px-4 py-3 text-gray-600">{row.customerName}</td>
                                                       <td className="px-4 py-3"><span className="inline-block bg-pink-50 text-pink-600 border border-pink-100 px-2 py-0.5 rounded-md text-xs font-bold">{row.monthLabel}</span></td>
                                                       <td className="px-4 py-3 text-right font-bold text-gray-700">{row.amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</td>
                                                   </tr>
                                               ))}
                                           </tbody>
                                       </table>
                                       {/* YENİ: 10'dan fazla kayıt varsa "Tümünü Göster / Daha Az" butonu en altta */}
                                       {giftSummary.detailRows.length > 10 && (
                                           <div className="border-t border-gray-100 p-3 text-center bg-gray-50/50">
                                               <button onClick={() => setGiftShowAll(!giftShowAll)} className="text-xs font-bold text-pink-600 hover:text-pink-700 transition-colors">
                                                   {giftShowAll ? '▲ Daha Az Göster' : `▼ Tümünü Göster (${giftSummary.detailRows.length} kayıt)`}
                                               </button>
                                           </div>
                                       )}
                                   </div>
                               ) : (
                                   <div className="text-center py-8 text-sm text-gray-400 font-medium bg-gray-50/50 rounded-xl border border-gray-100">Seçili dönemde hediye ay kaydı bulunmuyor.</div>
                               )}
                           </div>

                           <div className="flex flex-col lg:flex-row gap-6">
                               
                               {/* SOL TARAF - GRAFİK */}
                               <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
                                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                       <h3 className="text-lg font-bold text-gray-800">Ciro — Tahsil Edilen ve Bekleyen Ödemeler</h3>
                                       <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">{currentYearForChart} Yılı</span>
                                   </div>

                                   <div className="flex items-center justify-center gap-6 mb-4 text-xs font-bold">
                                       <div className="flex items-center gap-2"><span className="w-8 h-3 bg-red-400/80 rounded-sm"></span> <span className="text-gray-600">Tahsil Edilen (TL)</span></div>
                                       <div className="flex items-center gap-2"><span className="w-8 h-3 bg-blue-400/80 rounded-sm"></span> <span className="text-gray-600">Bekleyen Tahsilat (TL)</span></div>
                                   </div>

                                   <div className="flex-1 border border-gray-100 rounded-xl bg-slate-50/30 p-2">
                                       <FinansAreaChart data={chartData} />
                                   </div>
                               </div>

                               {/* SAĞ TARAF - ŞUBE BAZLI ÖDEMELER TABLOSU */}
                               <div className="w-full lg:w-[450px] bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
                                   <div className="flex flex-col gap-3 mb-6 border-b border-gray-100 pb-4">
                                       <h3 className="text-lg font-bold text-gray-800">Depo Şube Bazlı Ödemeler</h3>
                                       <select value={branchPaymentFilter} onChange={(e) => setBranchPaymentFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 bg-gray-50 cursor-pointer">
                                           <option value="1">Bu Ay</option>
                                           <option value="3">Son 3 Ay</option>
                                           <option value="6">Son 6 Ay</option>
                                           <option value="12">Son 12 Ay</option>
                                           <option value="all">Tüm Zamanlar (Seneler)</option>
                                       </select>
                                   </div>
                                   
                                   <div className="overflow-x-auto flex-1">
                                       <table className="w-full text-left text-sm text-gray-600">
                                           <thead className="border-b-2 border-gray-100 font-bold text-gray-700 text-xs uppercase">
                                               <tr>
                                                   <th className="pb-3 px-2">Şube</th>
                                                   <th className="pb-3 text-right px-2">Bekleyen</th>
                                                   <th className="pb-3 text-right px-2">Tahsil Edilen</th>
                                               </tr>
                                           </thead>
                                           <tbody className="divide-y divide-gray-100">
                                               {branchPaymentsData.map(bp => (
                                                   <tr key={bp.id} className="hover:bg-gray-50">
                                                       <td className="py-3 px-2 font-bold text-gray-700">{bp.name}</td>
                                                       <td className="py-3 px-2 text-right font-bold text-orange-500">{bp.bekleyen.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</td>
                                                       <td className="py-3 px-2 text-right font-black text-[#1bc5bd]">{bp.tahsil.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</td>
                                                   </tr>
                                               ))}
                                           </tbody>
                                       </table>
                                   </div>
                               </div>

                           </div>

                           {/* YENİ: ORTALAMA CİRO VE TREND BÖLÜMÜ */}
                           <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                               <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-50/30 gap-4">
                                   <div>
                                       <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2"><TrendingUp size={20} className="text-indigo-500" /> Ortalama Ciro Analizi ve Yıllık Trend</h3>
                                       <p className="text-sm text-indigo-900/60 mt-1 font-medium">Birim başına düşen ortalama gelirler ve aylık bazda artış/azalış tablosu.</p>
                                   </div>
                                   <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                                       <select value={avgRevenueYearFilter} onChange={(e) => setAvgRevenueYearFilter(e.target.value)} className="w-full sm:w-32 border border-indigo-200 rounded-lg px-4 py-2.5 text-sm font-bold text-indigo-800 focus:outline-none focus:border-indigo-400 bg-white shadow-sm cursor-pointer">
                                           {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                                               <option key={y} value={y}>{y} Yılı</option>
                                           ))}
                                       </select>
                                       <select value={avgRevenueBranchFilter} onChange={(e) => setAvgRevenueBranchFilter(e.target.value)} className="w-full sm:w-64 border border-indigo-200 rounded-lg px-4 py-2.5 text-sm font-bold text-indigo-800 focus:outline-none focus:border-indigo-400 bg-white shadow-sm cursor-pointer">
                                           <option value="all">Tüm Şubeler Filtresi</option>
                                           {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                       </select>
                                   </div>
                               </div>

                               <div className="p-6 bg-slate-50 border-b border-gray-100">
                                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                       <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                                           <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center"><Key size={24}/></div>
                                           <div>
                                               <div className="text-xs font-bold text-gray-500 uppercase">Oda Başı Ortalama Ciro</div>
                                               <div className="text-2xl font-black text-teal-700 mt-1">{currentMonthData.odaBasi.toLocaleString('tr-TR', {maximumFractionDigits:0})} ₺</div>
                                           </div>
                                       </div>
                                       <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                                           <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Box size={24}/></div>
                                           <div>
                                               <div className="text-xs font-bold text-gray-500 uppercase">M³ Başı Ortalama Ciro</div>
                                               <div className="text-2xl font-black text-blue-700 mt-1">{currentMonthData.m3Basi.toLocaleString('tr-TR', {maximumFractionDigits:0})} ₺</div>
                                           </div>
                                       </div>
                                       <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                                           <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center"><Home size={24}/></div>
                                           <div>
                                               <div className="text-xs font-bold text-gray-500 uppercase">Şube Başı Ortalama Ciro</div>
                                               <div className="text-2xl font-black text-purple-700 mt-1">{currentMonthData.subeBasi.toLocaleString('tr-TR', {maximumFractionDigits:0})} ₺</div>
                                           </div>
                                       </div>
                                   </div>
                               </div>

                               <div className="overflow-x-auto">
                                   <table className="w-full text-left text-sm text-gray-600 min-w-[900px]">
                                       <thead className="bg-white border-b-2 border-gray-200 text-[11px] uppercase text-gray-500 font-bold">
                                           <tr>
                                               <th className="px-6 py-4">Aylar ({trendYear})</th>
                                               <th className="px-6 py-4 text-right">Toplam Ciro (Tahakkuk)</th>
                                               <th className="px-6 py-4 text-center">Dolu Oda</th>
                                               <th className="px-6 py-4 text-center">Dolu M³</th>
                                               <th className="px-6 py-4 text-right text-teal-700">Oda Ort.</th>
                                               <th className="px-6 py-4 text-right text-blue-700">M³ Ort.</th>
                                               <th className="px-6 py-4 text-right text-purple-700">Şube Ort.</th>
                                               <th className="px-6 py-4 text-center">Trend (Aylık Ciro)</th>
                                           </tr>
                                       </thead>
                                       <tbody className="divide-y divide-gray-100 bg-white">
                                           {yearlyTrendData.map((data, idx) => {
                                               const prevRevenue = idx > 0 ? yearlyTrendData[idx - 1].revenue : data.revenue;
                                               const isUp = data.revenue > prevRevenue;
                                               const isDown = data.revenue < prevRevenue;
                                               const diffPercent = prevRevenue > 0 ? ((data.revenue - prevRevenue) / prevRevenue * 100).toFixed(1) : 0;

                                               return (
                                                   <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                       <td className="px-6 py-4 font-bold text-gray-800">{data.month}</td>
                                                       <td className="px-6 py-4 text-right font-black text-gray-700">{data.revenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</td>
                                                       <td className="px-6 py-4 text-center font-bold text-gray-600">{data.rooms}</td>
                                                       <td className="px-6 py-4 text-center font-bold text-gray-600">{data.m3}</td>
                                                       <td className="px-6 py-4 text-right font-bold text-teal-600">{data.odaBasi.toLocaleString('tr-TR', {maximumFractionDigits:0})} ₺</td>
                                                       <td className="px-6 py-4 text-right font-bold text-blue-600">{data.m3Basi.toLocaleString('tr-TR', {maximumFractionDigits:0})} ₺</td>
                                                       <td className="px-6 py-4 text-right font-bold text-purple-600">{data.subeBasi.toLocaleString('tr-TR', {maximumFractionDigits:0})} ₺</td>
                                                       <td className="px-6 py-4 text-center">
                                                           {idx === 0 || (!isUp && !isDown) ? (
                                                               <span className="text-gray-400 font-bold">-</span>
                                                           ) : (
                                                               <span className={`inline-flex items-center gap-1 font-bold px-2 py-1 rounded text-[10px] ${isUp ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                                   {isUp ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
                                                                   %{Math.abs(diffPercent)}
                                                               </span>
                                                           )}
                                                       </td>
                                                   </tr>
                                               );
                                           })}
                                       </tbody>
                                   </table>
                               </div>
                           </div>

                       </div>
                   );
               })()}
             </div>
      )}

      {activeMenu === 'depo-rapor' && (
             <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
               <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                 <div>
                   <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Finans Yönetimi</h1>
                   <h2 className="text-2xl font-bold text-slate-800">Depo Raporları ve Analizler</h2>
                   <p className="text-sm text-gray-500 mt-1">Şubeler bazında doluluk oranları, aktif kira getirileri ve yeni kiralama hareketleri.</p>
                 </div>
                 <button className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 shadow-sm">
                     <Download size={16} /> Raporu PDF İndir
                 </button>
               </div>

               {(() => {
                   const allRooms = rooms;
                   const totalRooms = allRooms.length;
                   const totalFullRooms = allRooms.filter(r => r.customerName).length;
                   const occupancyRate = totalRooms > 0 ? Math.round((totalFullRooms / totalRooms) * 100) : 0;

                   let totalMonthlyRevenue = 0;
                   const depoDetails = warehouses.map(depo => {
                       const stats = getWarehouseStats(depo.id);
                       const capacityM3 = getWarehouseCapacityM3(depo.id);
                       const occupiedM3 = getWarehouseOccupiedM3(depo.id);
                       
                       const depoBlocks = blocks.filter(b => b.warehouseId === depo.id).map(b => b.id);
                       const depoRooms = rooms.filter(r => depoBlocks.includes(r.blockId) && r.customerName);
                       
                       let depoRevenue = 0;
                       depoRooms.forEach(r => {
                           const baseAmt = Number(r.monthlyFee || 0);
                           const hasKdv = r.hasKdv !== undefined ? r.hasKdv : true;
                           depoRevenue += hasKdv ? baseAmt * 1.20 : baseAmt;
                       });

                       totalMonthlyRevenue += depoRevenue;

                       const depoTotalRooms = stats.full + stats.empty + stats.reserved;
                       const depoOccupancyRate = depoTotalRooms > 0 ? Math.round((stats.full / depoTotalRooms) * 100) : 0;

                       return {
                           ...depo,
                           stats,
                           capacityM3,
                           occupiedM3,
                           depoRevenue,
                           depoOccupancyRate,
                           totalRooms: depoTotalRooms
                       };
                   });
                   
                   // Getiriye göre büyükten küçüğe sırala
                   depoDetails.sort((a, b) => b.depoRevenue - a.depoRevenue);

                   // Son kiralanan (yeni tutulan) odalar
                   const recentRentals = [...allRooms]
                       .filter(r => r.customerName && r.entryDate)
                       .sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate))
                       .slice(0, 5);

                   return (
                       <div className="flex flex-col gap-6 pb-10">
                           
                           {/* ÖZET KARTLARI */}
                           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden group hover:border-blue-200 transition-colors">
                                   <div className="absolute -right-4 top-1/2 -translate-y-1/2 opacity-5 text-blue-600 group-hover:scale-110 transition-transform duration-500"><Home size={120} /></div>
                                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 relative z-10">Toplam Şube Sayısı</h3>
                                   <div className="text-3xl font-extrabold text-blue-600 relative z-10">{warehouses.length} <span className="text-lg font-bold text-blue-400">Depo</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2 relative z-10">Aktif hizmet veren lokasyonlar</p>
                               </div>
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden group hover:border-emerald-200 transition-colors">
                                   <div className="absolute -right-4 top-1/2 -translate-y-1/2 opacity-5 text-emerald-600 group-hover:scale-110 transition-transform duration-500"><Wallet size={120} /></div>
                                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 relative z-10">Aylık Aktif Kira Getirisi</h3>
                                   <div className="text-3xl font-extrabold text-emerald-500 relative z-10">{totalMonthlyRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg">₺</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2 relative z-10">Dolu odalardan beklenen aylık ciro</p>
                               </div>
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden group hover:border-orange-200 transition-colors">
                                   <div className="absolute -right-4 top-1/2 -translate-y-1/2 opacity-5 text-orange-600 group-hover:scale-110 transition-transform duration-500"><TrendingUp size={120} /></div>
                                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 relative z-10">Genel Doluluk Oranı</h3>
                                   <div className="text-3xl font-extrabold text-orange-500 relative z-10">%{occupancyRate}</div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2 relative z-10">{totalFullRooms} dolu / {totalRooms} toplam oda</p>
                               </div>
                               <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden group hover:border-indigo-200 transition-colors">
                                   <div className="absolute -right-4 top-1/2 -translate-y-1/2 opacity-5 text-indigo-600 group-hover:scale-110 transition-transform duration-500"><Box size={120} /></div>
                                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 relative z-10">Toplam Depolama Hacmi</h3>
                                   <div className="text-3xl font-extrabold text-indigo-500 relative z-10">{depoDetails.reduce((sum, d) => sum + d.capacityM3, 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} <span className="text-lg font-bold text-indigo-400">m³</span></div>
                                   <p className="text-[10px] font-medium text-gray-400 mt-2 relative z-10">Tüm şubelerin birleşik hacmi</p>
                               </div>
                           </div>

                           {/* ŞUBE BAZLI DETAYLI TABLO */}
                           <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                               <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                                   <div>
                                       <h3 className="text-lg font-bold text-gray-800">Şube Bazlı Gelir ve Doluluk Raporu</h3>
                                       <p className="text-sm text-gray-500 mt-1">Hangi deponun ne kadar ciro getirdiğini ve mevcut kapasite kullanımını inceleyin.</p>
                                   </div>
                               </div>
                               <div className="overflow-x-auto">
                                   <table className="w-full text-left text-sm text-gray-600 min-w-[900px]">
                                       <thead className="bg-white border-b border-gray-200 text-[11px] uppercase text-gray-500 font-bold">
                                           <tr>
                                               <th className="px-6 py-4">Depo Şubesi</th>
                                               <th className="px-6 py-4 text-center">Toplam Oda</th>
                                               <th className="px-6 py-4 text-center">Dolu / Boş</th>
                                               <th className="px-6 py-4 text-center">Doluluk Oranı</th>
                                               <th className="px-6 py-4 text-center">Hacim (Dolu/Top.)</th>
                                               <th className="px-6 py-4 text-right">Aylık Kira Getirisi</th>
                                           </tr>
                                       </thead>
                                       <tbody className="divide-y divide-gray-100 bg-white">
                                           {depoDetails.map((depo, idx) => (
                                               <tr key={depo.id} className="hover:bg-blue-50/30 transition-colors">
                                                   <td className="px-6 py-4">
                                                       <div className="font-bold text-gray-800 text-[14px] flex items-center gap-2">
                                                           {idx === 0 && <span className="bg-yellow-100 text-yellow-700 p-1 rounded-md" title="En Yüksek Getiri">👑</span>}
                                                           {depo.name}
                                                       </div>
                                                       <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider font-semibold">Ciro Sırası: #{idx + 1}</div>
                                                   </td>
                                                   <td className="px-6 py-4 text-center font-bold text-gray-700 text-[15px]">{depo.totalRooms}</td>
                                                   <td className="px-6 py-4 text-center">
                                                       <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                                                           <span className="text-red-600 font-bold" title="Dolu">{depo.stats.full}</span>
                                                           <span className="text-gray-300">/</span>
                                                           <span className="text-teal-600 font-bold" title="Boş">{depo.stats.empty}</span>
                                                       </div>
                                                   </td>
                                                   <td className="px-6 py-4 text-center">
                                                       <div className="flex flex-col items-center gap-1.5 justify-center">
                                                           <span className="font-bold text-gray-700 text-[13px]">%{depo.depoOccupancyRate}</span>
                                                           <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                                               <div className={`h-full rounded-full transition-all duration-500 ${depo.depoOccupancyRate > 80 ? 'bg-green-500' : depo.depoOccupancyRate > 40 ? 'bg-orange-400' : 'bg-red-400'}`} style={{width: `${depo.depoOccupancyRate}%`}}></div>
                                                           </div>
                                                       </div>
                                                   </td>
                                                   <td className="px-6 py-4 text-center">
                                                       <div className="text-xs font-bold text-slate-700">{depo.occupiedM3.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} m³</div>
                                                       <div className="text-[10px] text-gray-400 font-medium">Toplam: {depo.capacityM3.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} m³</div>
                                                   </td>
                                                   <td className="px-6 py-4 text-right">
                                                       <div className="font-black text-emerald-600 text-lg tracking-tight">{depo.depoRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</div>
                                                       <div className="text-[10px] font-bold text-gray-400">Beklenen Kazanç</div>
                                                   </td>
                                               </tr>
                                           ))}
                                       </tbody>
                                       <tfoot className="bg-slate-50 border-t border-gray-200 font-bold text-gray-800">
                                           <tr>
                                               <td className="px-6 py-4 text-xs tracking-wider uppercase text-gray-500">Genel Toplam</td>
                                               <td className="px-6 py-4 text-center text-[15px]">{totalRooms}</td>
                                               <td className="px-6 py-4 text-center text-[15px] text-red-600">{totalFullRooms} Dolu</td>
                                               <td className="px-6 py-4 text-center text-[15px]">%{occupancyRate}</td>
                                               <td className="px-6 py-4 text-center text-[15px]">{depoDetails.reduce((sum, d) => sum + d.occupiedM3, 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} m³ Dolu</td>
                                               <td className="px-6 py-4 text-right text-emerald-700 text-xl">{totalMonthlyRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</td>
                                           </tr>
                                       </tfoot>
                                   </table>
                               </div>
                           </div>

                           {/* YENİ EKLENEN: GİRİŞ ÇIKIŞ YAPAN ODA HAREKETLERİ RAPORU */}
                           {(() => {
                               // YENİ: Zaman aralığı — Bu Ay / Son 3 Ay / Son 6 Ay / Bu Sene / Geçen Sene / Tüm Zamanlar
                               const getMovementRange = () => {
                                   const now = new Date();
                                   let start; let end = null;
                                   if (depoReportTimeFilter === 'buay') start = new Date(now.getFullYear(), now.getMonth(), 1);
                                   // YENİ: GEÇEN AY — önceki ayın 1'i ile son günü arası.
                                   // new Date(yıl, ay, 0) o aydan ÖNCEKİ ayın son gününü verir; Ocak ayındayken
                                   // getMonth()-1 = -1 olsa bile JS bunu otomatik olarak önceki yılın Aralık ayına çevirir.
                                   else if (depoReportTimeFilter === 'gecenay') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); }
                                   else if (depoReportTimeFilter === '3aylik') { start = new Date(); start.setMonth(start.getMonth() - 3); }
                                   else if (depoReportTimeFilter === '6aylik') { start = new Date(); start.setMonth(start.getMonth() - 6); }
                                   else if (depoReportTimeFilter === 'busene') start = new Date(now.getFullYear(), 0, 1);
                                   else if (depoReportTimeFilter === 'gecensene') { start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59); }
                                   else start = new Date(2000, 0, 1); // Tüm Zamanlar
                                   return { start, end };
                               };
                               const { start: movementStartDate, end: movementEndDate } = getMovementRange();
                               // Tarih seçili aralıkta mı? (üst sınır "Geçen Sene" ve "Geçen Ay" seçildiğinde vardır)
                               const inMovementRange = (dt) => dt >= movementStartDate && (!movementEndDate || dt <= movementEndDate);

                               const movementReport = warehouses.filter(w => depoReportWhFilter === 'all' || w.id.toString() === depoReportWhFilter).map(wh => {
                                   const whBlocks = blocks.filter(b => b.warehouseId === wh.id).map(b => b.id);
                                   const whRooms = allRooms.filter(r => whBlocks.includes(r.blockId));
                                   
                                   let newEntries = 0;
                                   let exits = 0;

                                   whRooms.forEach(room => {
                                       // Aktif kiralamalardaki yeni girişler
                                       if (room.customerName && room.entryDate) {
                                           const eDate = parseDateLocal(room.entryDate);
                                           if (inMovementRange(eDate)) newEntries++;
                                       }
                                       // Geçmiş arşivdeki giriş/çıkış sayıları
                                       if (room.history && room.history.length > 0) {
                                           room.history.forEach(h => {
                                               if (h.entryDate) {
                                                   const eDate = parseDateLocal(h.entryDate);
                                                   if (inMovementRange(eDate)) newEntries++;
                                               }
                                               if (h.exitDate) {
                                                   const exDate = parseDateLocal(h.exitDate);
                                                   if (inMovementRange(exDate)) exits++;
                                               }
                                           });
                                       }
                                   });
                                   
                                   return { ...wh, newEntries, exits, netChange: newEntries - exits };
                               });

                               return (
                                   <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                                       <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/50 gap-4">
                                           <div>
                                               <h3 className="text-lg font-bold text-gray-800">Depo Kiralama Hareketleri (Giriş - Çıkış Raporu)</h3>
                                               <p className="text-sm text-gray-500 mt-1">Seçili tarih aralığında şubelerdeki yeni kiralama ve tahliye sayıları.</p>
                                           </div>
                                           <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                                               <select value={depoReportWhFilter} onChange={(e) => setDepoReportWhFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-indigo-400 bg-white shadow-sm cursor-pointer">
                                                   <option value="all">Tüm Şubeler</option>
                                                   {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                               </select>
                                               <select value={depoReportTimeFilter} onChange={(e) => setDepoReportTimeFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-indigo-400 bg-white shadow-sm cursor-pointer">
                                                   <option value="buay">Bu Ay</option>
                                                   {/* YENİ: Geçen Ay seçeneği — önceki ayın giriş/çıkışlarını gösterir */}
                                                   <option value="gecenay">Geçen Ay</option>
                                                   <option value="3aylik">Son 3 Ay</option>
                                                   <option value="6aylik">Son 6 Ay</option>
                                                   <option value="busene">Bu Sene</option>
                                                   <option value="gecensene">Geçen Sene</option>
                                                   <option value="all">Tüm Zamanlar</option>
                                               </select>
                                           </div>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-left text-sm text-gray-600 min-w-[700px]">
                                               <thead className="bg-white border-b border-gray-200 text-[11px] uppercase text-gray-500 font-bold">
                                                   <tr>
                                                       <th className="px-6 py-4">Depo Şubesi</th>
                                                       <th className="px-6 py-4 text-center">Yeni Giriş (Kiralama)</th>
                                                       <th className="px-6 py-4 text-center">Çıkış Yapan (Tahliye)</th>
                                                       <th className="px-6 py-4 text-center">Net Değişim</th>
                                                   </tr>
                                               </thead>
                                               <tbody className="divide-y divide-gray-100 bg-white">
                                                   {movementReport.map(report => (
                                                       <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                                                           <td className="px-6 py-4 font-bold text-gray-800 text-[14px]">{report.name}</td>
                                                           <td className="px-6 py-4 text-center">
                                                               <span className="text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-center w-max mx-auto gap-1.5">
                                                                   <ArrowDown size={14}/> {report.newEntries} Yeni Oda
                                                               </span>
                                                           </td>
                                                           <td className="px-6 py-4 text-center">
                                                               <span className="text-rose-700 font-bold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 flex items-center justify-center w-max mx-auto gap-1.5">
                                                                   <ArrowUp size={14}/> {report.exits} Çıkış
                                                               </span>
                                                           </td>
                                                           <td className="px-6 py-4 text-center">
                                                               <span className={`font-black text-sm px-4 py-1.5 rounded-full ${report.netChange > 0 ? 'text-emerald-700 bg-emerald-100' : report.netChange < 0 ? 'text-rose-700 bg-rose-100' : 'text-gray-600 bg-gray-100'}`}>
                                                                   {report.netChange > 0 ? '+' : ''}{report.netChange} Oda
                                                               </span>
                                                           </td>
                                                       </tr>
                                                   ))}
                                               </tbody>
                                               <tfoot className="bg-slate-50 border-t border-gray-200 font-bold text-gray-800">
                                                   <tr>
                                                       <td className="px-6 py-5 text-xs tracking-wider uppercase text-gray-500">Genel Toplam</td>
                                                       <td className="px-6 py-5 text-center text-emerald-700 text-[16px]">{movementReport.reduce((acc, r) => acc + r.newEntries, 0)} Toplam Giriş</td>
                                                       <td className="px-6 py-5 text-center text-rose-700 text-[16px]">{movementReport.reduce((acc, r) => acc + r.exits, 0)} Toplam Çıkış</td>
                                                       <td className="px-6 py-5 text-center text-[16px]">{movementReport.reduce((acc, r) => acc + r.netChange, 0) > 0 ? '+' : ''}{movementReport.reduce((acc, r) => acc + r.netChange, 0)} Net Oda</td>
                                                   </tr>
                                               </tfoot>
                                           </table>
                                       </div>
                                   </div>
                               );
                           })()}

                           {/* ============================================================
                               YENİ EKLENEN: AYLIK KİRA HACMİ (CİRO) GİRİŞ - ÇIKIŞ RAPORU
                               Üstteki rapor ODA ADEDİNİ sayar; bu rapor o odaların AYLIK KİRA TUTARINI (TL) toplar.
                               - Giren Hacim  : Seçili dönemde kiralanan odaların aylık kira toplamı
                               - Çıkan Hacim  : Seçili dönemde tahliye edilen odaların aylık kira toplamı
                               - Net Hacim    : Giren - Çıkan (aylık ciromuza net etkisi)
                               Filtreler üstteki rapordan BAĞIMSIZDIR (kendi state'lerini kullanır).
                               ============================================================ */}
                           {(() => {
                               // Zaman aralığı — üstteki raporla AYNI seçenekler (Bu Ay / Geçen Ay / Son 3 Ay / Son 6 Ay / Bu Sene / Geçen Sene / Tüm Zamanlar)
                               const getHacimRange = () => {
                                   const now = new Date();
                                   let start; let end = null;
                                   if (hacimReportTimeFilter === 'buay') start = new Date(now.getFullYear(), now.getMonth(), 1);
                                   // GEÇEN AY: new Date(yıl, ay, 0) önceki ayın son gününü verir; Ocak'ta JS otomatik olarak
                                   // önceki yılın Aralık ayına geçer (ay sonu 28/29/30/31 farkları kendiliğinden doğru hesaplanır).
                                   else if (hacimReportTimeFilter === 'gecenay') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); }
                                   else if (hacimReportTimeFilter === '3aylik') { start = new Date(); start.setMonth(start.getMonth() - 3); }
                                   else if (hacimReportTimeFilter === '6aylik') { start = new Date(); start.setMonth(start.getMonth() - 6); }
                                   else if (hacimReportTimeFilter === 'busene') start = new Date(now.getFullYear(), 0, 1);
                                   else if (hacimReportTimeFilter === 'gecensene') { start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59); }
                                   else start = new Date(2000, 0, 1); // Tüm Zamanlar
                                   return { start, end };
                               };
                               const { start: hacimStartDate, end: hacimEndDate } = getHacimRange();
                               const inHacimRange = (dt) => dt >= hacimStartDate && (!hacimEndDate || dt <= hacimEndDate);

                               const hacimReport = warehouses.filter(w => hacimReportWhFilter === 'all' || w.id.toString() === hacimReportWhFilter).map(wh => {
                                   const whBlocks = blocks.filter(b => b.warehouseId === wh.id).map(b => b.id);
                                   const whRooms = allRooms.filter(r => whBlocks.includes(r.blockId));

                                   let inVolume = 0;   // Giren aylık kira hacmi (TL)
                                   let outVolume = 0;  // Çıkan aylık kira hacmi (TL)
                                   let inCount = 0;    // Kaç oda girdi (hacmin kaç odadan geldiğini görmek için)
                                   let outCount = 0;   // Kaç oda çıktı

                                   whRooms.forEach(room => {
                                       // 1) Halen AKTİF kiralamalar — dönem içinde giriş yapmışsa hacme eklenir
                                       if (room.customerName && room.entryDate) {
                                           const eDate = parseDateLocal(room.entryDate);
                                           if (inHacimRange(eDate)) { inVolume += Number(room.monthlyFee || 0); inCount++; }
                                       }
                                       // 2) ARŞİV (geçmiş) kayıtları — giriş ve çıkış hacimleri ayrı ayrı hesaplanır
                                       if (room.history && room.history.length > 0) {
                                           room.history.forEach(h => {
                                               const hFee = Number(h.monthlyFee || 0);
                                               if (h.entryDate) {
                                                   const eDate = parseDateLocal(h.entryDate);
                                                   if (inHacimRange(eDate)) { inVolume += hFee; inCount++; }
                                               }
                                               if (h.exitDate) {
                                                   const exDate = parseDateLocal(h.exitDate);
                                                   if (inHacimRange(exDate)) { outVolume += hFee; outCount++; }
                                               }
                                           });
                                       }
                                   });

                                   return { ...wh, inVolume, outVolume, inCount, outCount, netVolume: inVolume - outVolume };
                               });

                               // Genel toplamlar (tfoot için)
                               const totalIn = hacimReport.reduce((acc, r) => acc + r.inVolume, 0);
                               const totalOut = hacimReport.reduce((acc, r) => acc + r.outVolume, 0);
                               const totalNet = totalIn - totalOut;
                               const fmtTL = (n) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

                               return (
                                   <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                                       <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/50 gap-4">
                                           <div>
                                               <h3 className="text-lg font-bold text-gray-800">Aylık Kira Hacmi Hareketleri (Giren - Çıkan Ciro)</h3>
                                               <p className="text-sm text-gray-500 mt-1">Seçili tarih aralığında kiralanan ve tahliye edilen odaların aylık kira tutarı (KDV hariç).</p>
                                           </div>
                                           <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                                               <select value={hacimReportWhFilter} onChange={(e) => setHacimReportWhFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-indigo-400 bg-white shadow-sm cursor-pointer">
                                                   <option value="all">Tüm Şubeler</option>
                                                   {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                               </select>
                                               <select value={hacimReportTimeFilter} onChange={(e) => setHacimReportTimeFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-indigo-400 bg-white shadow-sm cursor-pointer">
                                                   <option value="buay">Bu Ay</option>
                                                   <option value="gecenay">Geçen Ay</option>
                                                   <option value="3aylik">Son 3 Ay</option>
                                                   <option value="6aylik">Son 6 Ay</option>
                                                   <option value="busene">Bu Sene</option>
                                                   <option value="gecensene">Geçen Sene</option>
                                                   <option value="all">Tüm Zamanlar</option>
                                               </select>
                                           </div>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-left text-sm text-gray-600 min-w-[700px]">
                                               <thead className="bg-white border-b border-gray-200 text-[11px] uppercase text-gray-500 font-bold">
                                                   <tr>
                                                       <th className="px-6 py-4">Depo Şubesi</th>
                                                       <th className="px-6 py-4 text-center">Giren Kira Hacmi</th>
                                                       <th className="px-6 py-4 text-center">Çıkan Kira Hacmi</th>
                                                       <th className="px-6 py-4 text-center">Net Hacim Değişimi</th>
                                                   </tr>
                                               </thead>
                                               <tbody className="divide-y divide-gray-100 bg-white">
                                                   {hacimReport.map(report => (
                                                       <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                                                           <td className="px-6 py-4 font-bold text-gray-800 text-[14px]">{report.name}</td>
                                                           <td className="px-6 py-4 text-center">
                                                               <span className="text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-center w-max mx-auto gap-1.5">
                                                                   <ArrowDown size={14}/> +{fmtTL(report.inVolume)} TL
                                                               </span>
                                                               {/* Hacmin kaç odadan geldiği */}
                                                               <span className="block text-[10px] text-gray-400 font-bold mt-1">{report.inCount} oda</span>
                                                           </td>
                                                           <td className="px-6 py-4 text-center">
                                                               <span className="text-rose-700 font-bold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 flex items-center justify-center w-max mx-auto gap-1.5">
                                                                   <ArrowUp size={14}/> -{fmtTL(report.outVolume)} TL
                                                               </span>
                                                               <span className="block text-[10px] text-gray-400 font-bold mt-1">{report.outCount} oda</span>
                                                           </td>
                                                           <td className="px-6 py-4 text-center">
                                                               <span className={`font-black text-sm px-4 py-1.5 rounded-full ${report.netVolume > 0 ? 'text-emerald-700 bg-emerald-100' : report.netVolume < 0 ? 'text-rose-700 bg-rose-100' : 'text-gray-600 bg-gray-100'}`}>
                                                                   {report.netVolume > 0 ? '+' : ''}{fmtTL(report.netVolume)} TL
                                                               </span>
                                                           </td>
                                                       </tr>
                                                   ))}
                                               </tbody>
                                               <tfoot className="bg-slate-50 border-t border-gray-200 font-bold text-gray-800">
                                                   <tr>
                                                       <td className="px-6 py-5 text-xs tracking-wider uppercase text-gray-500">Genel Toplam</td>
                                                       <td className="px-6 py-5 text-center text-emerald-700 text-[16px]">+{fmtTL(totalIn)} TL</td>
                                                       <td className="px-6 py-5 text-center text-rose-700 text-[16px]">-{fmtTL(totalOut)} TL</td>
                                                       <td className="px-6 py-5 text-center text-[16px]">{totalNet > 0 ? '+' : ''}{fmtTL(totalNet)} TL Net</td>
                                                   </tr>
                                               </tfoot>
                                           </table>
                                       </div>
                                   </div>
                               );
                           })()}

                           {/* SON KİRALAMALAR / YENİ TUTULAN ODALAR */}
                           <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                               <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/30">
                                   <div>
                                       <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2"><Key size={20} className="text-indigo-500" /> Yeni Tutulan Depolar (Son Hareketler)</h3>
                                       <p className="text-sm text-indigo-900/60 mt-1 font-medium">Sisteme en son giriş yapılan aktif kiralama işlemleri.</p>
                                   </div>
                                   <button onClick={() => setActiveMenu('depo')} className="bg-white border border-indigo-100 hover:bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">Tüm Odalara Git &rarr;</button>
                               </div>
                               <div className="p-0">
                                   {recentRentals.length > 0 ? (
                                       <div className="divide-y divide-gray-100 bg-white">
                                           {recentRentals.map(r => {
                                               const block = blocks.find(b => b.id === r.blockId);
                                               const wh = warehouses.find(w => w.id === block?.warehouseId);
                                               const baseAmt = Number(r.monthlyFee || 0);
                                               const hasKdv = r.hasKdv !== undefined ? r.hasKdv : true;
                                               const fee = hasKdv ? baseAmt * 1.20 : baseAmt;
                                               
                                               return (
                                                   <div key={r.id} className="p-5 flex flex-col sm:flex-row justify-between sm:items-center hover:bg-indigo-50/20 transition-colors gap-4 group">
                                                       <div className="flex items-center gap-4">
                                                           <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-lg border border-indigo-200 shadow-sm group-hover:scale-110 transition-transform">
                                                               {r.name.split('-')[0] || r.name.charAt(0)}
                                                           </div>
                                                           <div>
                                                               <h4 className="font-bold text-gray-800 text-[15px] cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => {const c=customers.find(c=>c.name===r.customerName); if(c) setSelectedCustomerId(c.id);}}>
                                                                   {r.customerName}
                                                               </h4>
                                                               <div className="text-xs text-gray-500 font-bold mt-1.5 flex items-center gap-2">
                                                                   <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 border border-gray-200">{r.name} Odası</span>
                                                                   <span className="text-gray-300">•</span>
                                                                   <span className="text-indigo-600">{wh?.name}</span>
                                                               </div>
                                                           </div>
                                                       </div>
                                                       <div className="flex flex-col sm:items-end">
                                                           <div className="font-black text-emerald-600 text-lg tracking-tight">{fee.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL <span className="text-[10px] text-emerald-600/60 font-bold">/AY</span></div>
                                                           <div className="text-xs text-gray-400 font-bold mt-1 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">Giriş: {r.entryDate}</div>
                                                       </div>
                                                   </div>
                                               );
                                           })}
                                       </div>
                                   ) : (
                                       <div className="p-12 text-center flex flex-col items-center justify-center">
                                           <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3"><Key size={24} className="text-gray-300"/></div>
                                           <div className="text-gray-500 font-bold">Henüz bir kiralama kaydı bulunmuyor.</div>
                                       </div>
                                   )}
                               </div>
                           </div>

                       </div>
                   );
               })()}
             </div>
      )}

      {activeMenu === 'personel-rapor' && (
            /* YENİ: PERSONEL RAPOR — her personelin (depo sorumlusunun) açtığı oda ve kaydettiği
               müşteri sayılarını zaman ve şube filtresiyle raporlar. */
            <div className="max-w-7xl mx-auto flex flex-col h-full animate-in fade-in duration-300">
              <div className="mb-6">
                  <h1 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-1">Finans / Personel Takibi</h1>
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><UserCog size={24} className="text-indigo-500" /> Personel Rapor</h2>
                  <p className="text-sm text-gray-500 mt-1">Depo sorumlularının performansı: kaç oda kiralamış, kaç müşteri kaydetmiş. Zaman ve şube bazında filtreleyin.</p>
              </div>

              {/* Filtreler */}
              <div className="flex flex-col lg:flex-row gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                 <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Zaman Aralığı</label>
                    <div className="flex flex-wrap gap-1.5">
                       {[['today','Bugün'],['yesterday','Dün'],['week','Bu Hafta'],['month','Bu Ay'],['year','Bu Sene'],['all','Tüm Zamanlar']].map(([val,label]) => (
                          <button key={val} onClick={() => setPersonelReportRange(val)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${personelReportRange === val ? 'bg-indigo-500 text-white shadow-sm' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}>{label}</button>
                       ))}
                    </div>
                 </div>
                 <div className="lg:w-64">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Şube</label>
                    <select value={personelReportWarehouse} onChange={(e) => setPersonelReportWarehouse(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:border-indigo-400">
                       <option value="all">Tüm Şubeler</option>
                       {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                 </div>
              </div>

              {(() => {
                  const range = personelReportRange;
                  const whFilter = personelReportWarehouse;

                  // Bir odanın şube filtresine uyup uymadığı
                  const roomInWh = (r) => {
                      if (whFilter === 'all') return true;
                      const blk = blocks.find(b => b.id === r.blockId);
                      return String(blk?.warehouseId) === String(whFilter);
                  };
                  // Bir müşterinin şube filtresine uyması: o müşterinin şubedeki bir odada kaydı varsa
                  const custInWh = (custName) => {
                      if (whFilter === 'all') return true;
                      return rooms.some(r => r.customerName === custName && roomInWh(r));
                  };

                  // Raporlanacak personeller: sistemdeki tüm kullanıcılar (depo sorumluları dahil)
                  // Her personel için oda ve müşteri kayıtları isim üzerinden eşleştirilir.
                  const staffRows = systemUsers.map(user => {
                      const name = user.name;
                      // Bu personelin kiraladığı (açtığı) DOLU odalar — giriş tarihi filtreye uygun + şube filtresi
                      const staffRooms = rooms.filter(r =>
                          r.rentedBy === name && r.customerName &&
                          roomInWh(r) &&
                          (range === 'all' ? true : inDashboardRange(parseAnyDate(r.entryDate), range))
                      );
                      // Bu personelin kaydettiği müşteriler — createdAt filtreye uygun + şube filtresi
                      const staffCustomers = customers.filter(c =>
                          c.createdBy === name &&
                          custInWh(c.name) &&
                          (range === 'all' ? true : inDashboardRange(parseAnyDate(c.createdAt), range))
                      );
                      // Bu personelin kiraladığı odaların beklenen aylık kira getirisi (KDV dahil)
                      const totalRent = staffRooms.reduce((sum, r) => {
                          const base = Number(getRoomLatestFee(r) || 0);
                          const hasKdv = r.hasKdv !== undefined ? r.hasKdv : true;
                          return sum + (hasKdv ? base * 1.20 : base);
                      }, 0);
                      return {
                          id: user.id,
                          name,
                          role: user.role || '-',
                          roomCount: staffRooms.length,
                          customerCount: staffCustomers.length,
                          totalRent: Math.round(totalRent)
                      };
                  })
                  // Aktivitesi olanları öne al, oda sayısına göre sırala
                  .sort((a, b) => (b.roomCount + b.customerCount) - (a.roomCount + a.customerCount));

                  // Üst özet toplamları
                  const sumRooms = staffRows.reduce((s, r) => s + r.roomCount, 0);
                  const sumCustomers = staffRows.reduce((s, r) => s + r.customerCount, 0);
                  const sumRent = staffRows.reduce((s, r) => s + r.totalRent, 0);
                  const activeStaff = staffRows.filter(r => r.roomCount > 0 || r.customerCount > 0).length;

                  return (
                    <div className="flex flex-col gap-6 pb-8">
                       {/* Özet kartları */}
                       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-indigo-500">
                             <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Aktif Personel</p>
                             <p className="text-2xl font-black text-indigo-600">{activeStaff}</p>
                             <p className="text-[10px] text-gray-400 mt-1">İşlem yapan personel</p>
                          </div>
                          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-teal-500">
                             <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Toplam Oda Kaydı</p>
                             <p className="text-2xl font-black text-teal-600">{sumRooms}</p>
                             <p className="text-[10px] text-gray-400 mt-1">Kiralanan oda</p>
                          </div>
                          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-blue-500">
                             <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Toplam Müşteri Kaydı</p>
                             <p className="text-2xl font-black text-blue-600">{sumCustomers}</p>
                             <p className="text-[10px] text-gray-400 mt-1">Kaydedilen müşteri</p>
                          </div>
                          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 border-l-4 border-l-green-500">
                             <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Getirilen Kira</p>
                             <p className="text-2xl font-black text-green-600">{sumRent.toLocaleString('tr-TR')} ₺</p>
                             <p className="text-[10px] text-gray-400 mt-1">Beklenen aylık (KDV dahil)</p>
                          </div>
                       </div>

                       {/* Personel tablosu */}
                       <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                          <div className="px-5 py-4 border-b border-gray-100">
                             <h3 className="font-bold text-slate-800">Personel Performans Tablosu</h3>
                             <p className="text-xs text-gray-500 mt-0.5">Seçili filtrelere göre her personelin kayıt istatistikleri.</p>
                          </div>
                          <div className="overflow-x-auto">
                             <table className="w-full text-sm">
                                <thead>
                                   <tr className="text-[10px] font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                                      <th className="text-left px-5 py-3">Personel</th>
                                      <th className="text-left px-3 py-3">Rol</th>
                                      <th className="text-center px-3 py-3">Oda Kaydı</th>
                                      <th className="text-center px-3 py-3">Müşteri Kaydı</th>
                                      <th className="text-right px-5 py-3">Getirilen Kira</th>
                                   </tr>
                                </thead>
                                <tbody>
                                   {staffRows.map((row, i) => (
                                      <tr key={row.id} className={`border-b border-gray-50 last:border-0 ${row.roomCount === 0 && row.customerCount === 0 ? 'opacity-50' : 'hover:bg-indigo-50/30'} transition-colors`}>
                                         <td className="px-5 py-3">
                                            <div className="flex items-center gap-2.5">
                                               <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${i === 0 && (row.roomCount + row.customerCount) > 0 ? 'bg-amber-400' : 'bg-indigo-400'}`}>{(row.name || '?').charAt(0)}</div>
                                               <span className="font-bold text-slate-700">{row.name}</span>
                                            </div>
                                         </td>
                                         <td className="px-3 py-3"><span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{row.role}</span></td>
                                         <td className="text-center px-3 py-3"><span className="font-black text-teal-600 text-base">{row.roomCount}</span></td>
                                         <td className="text-center px-3 py-3"><span className="font-black text-blue-600 text-base">{row.customerCount}</span></td>
                                         <td className="text-right px-5 py-3 font-bold text-green-600">{row.totalRent.toLocaleString('tr-TR')} ₺</td>
                                      </tr>
                                   ))}
                                   {staffRows.length === 0 && (
                                      <tr><td colSpan="5" className="text-center py-12 text-gray-400">Personel kaydı bulunamadı.</td></tr>
                                   )}
                                </tbody>
                             </table>
                          </div>
                       </div>

                       <p className="text-[11px] text-gray-400 italic">Not: Oda kayıtları odanın giriş tarihine, müşteri kayıtları ise kayıt tarihine göre filtrelenir. "Getirilen Kira" seçili personelin kiraladığı dolu odaların güncel aylık kira toplamıdır.</p>
                    </div>
                  );
              })()}
            </div>
      )}
    </>
  );
}
