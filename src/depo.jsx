import { useState } from 'react';
import { doc, setDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import {
  Eye,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit,
  Plus,
  Search,
  Clock,
  MapPin,
  Home,
  Box,
  Shield,
  Calendar,
  UserCog,
  X,
  Check,
  ArrowLeft,
  MoveHorizontal,
  MoveDiagonal,
  MoveVertical,
  Columns,
  AlertCircle,
  RefreshCcw,
  Upload,
  Lock,
  Key,
  LayoutDashboard
} from 'lucide-react';

// ============================================================================
// DEPO (ŞUBE / BLOK / ODA) BİLEŞENİ
// App.jsx içindeki "Depo Listesi" ekranı, ilgili modallar ve depo işlemlerini
// yapan kodlar buraya taşındı. Müşteri/Ödeme/Finans state'leri ve mantığı
// App.jsx içinde kalır; bu bileşen ihtiyaç duyduğu paylaşılan veriyi ve
// yardımcı fonksiyonları props üzerinden alır.
// ============================================================================
export default function Depo(props) {
  const {
    activeMenu, setActiveMenu,
    warehouses, setWarehouses,
    blocks, setBlocks,
    rooms, setRooms,
    inspections, setInspections,
    selectedWarehouseId, setSelectedWarehouseId,
    selectedBlockId, setSelectedBlockId,
    setSelectedRoomId,
    activeSizeFilter, setActiveSizeFilter,
    sizeFilterScope, setSizeFilterScope,
    showReservedView, setShowReservedView,
    reservedViewScope, setReservedViewScope,
    setRoomPhotoViewer,
    bulkM3Result,
    inspectionWarehouseId, setInspectionWarehouseId,
    getWarehouseStats, getWarehouseOccupiedM3, getWarehouseCapacityM3,
    getRoomStats, getBlockOccupiedM3, getBlockCapacityM3,
    displayRoomM3, formatRoomDims, roundRoomM3,
    db, firebaseUser, appId,
    checkActionPerm, logActivity, archiveDeletedItem, uploadImageToServer,
    currentUserProfile, getCurrentRole,
  } = props;

  // --- DEPO LİSTESİ STATE'LERİ ---
  const [isAddWarehouseModalOpen, setIsAddWarehouseModalOpen] = useState(false);
  const [newDepoName, setNewDepoName] = useState('');
  const [newDepoM3, setNewDepoM3] = useState('');
  const [newDepoAddress, setNewDepoAddress] = useState('');
  const [newDepoMapLink, setNewDepoMapLink] = useState(''); // Google Harita linki

  const [isEditWarehouseModalOpen, setIsEditWarehouseModalOpen] = useState(false);
  const [editWarehouseData, setEditWarehouseData] = useState(null);

  const [isDeleteWarehouseModalOpen, setIsDeleteWarehouseModalOpen] = useState(false);
  const [warehouseToDelete, setWarehouseToDelete] = useState(null);

  const handleAddWarehouse = async () => {
      if(!checkActionPerm('action-depo-ekle')) return;
      logActivity('Depo Ekleme', `Yeni depo/şube eklendi: ${newDepoName || ''}`);
      if (!newDepoName) return;
      const newWarehouse = { id: Date.now(), name: newDepoName, m3: newDepoM3 || 0, address: newDepoAddress, mapLink: newDepoMapLink || '', orderIndex: warehouses.length };
      if (db && firebaseUser) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', String(newWarehouse.id)), newWarehouse);
      else setWarehouses([...warehouses, newWarehouse]);
      setIsAddWarehouseModalOpen(false); setNewDepoName(''); setNewDepoM3(''); setNewDepoAddress(''); setNewDepoMapLink('');
  };

  const handleEditWarehouse = async () => {
      if(!checkActionPerm('action-depo-duzenle')) return;
      if (!editWarehouseData?.name) return;
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', String(editWarehouseData.id)), { name: editWarehouseData.name, m3: editWarehouseData.m3, address: editWarehouseData.address || '', mapLink: editWarehouseData.mapLink || '' }, { merge: true });
          } catch (e) { console.error("Firebase Depo Güncelleme Hatası:", e); }
      } else {
          setWarehouses(warehouses.map(w => w.id === editWarehouseData.id ? { ...w, name: editWarehouseData.name, m3: editWarehouseData.m3, address: editWarehouseData.address || '', mapLink: editWarehouseData.mapLink || '' } : w));
      }
      setIsEditWarehouseModalOpen(false); setEditWarehouseData(null);
  };

  const handleDeleteWarehouseClick = (e, id) => {
      if(!checkActionPerm('action-sube-sil')) return;
      e.stopPropagation();
      setWarehouseToDelete(id);
      setIsDeleteWarehouseModalOpen(true);
  };

  const confirmDeleteWarehouse = async () => {
      if (!warehouseToDelete) return;
      logActivity('Depo Silme', `Bir depo/şube silindi.`);
      // Silinen şubeyi geri yükleme çöp kutusuna arşivle
      const whToArchive = warehouses.find(w => w.id === warehouseToDelete);
      if (whToArchive) await archiveDeletedItem('Şube/Depo', 'warehouses', whToArchive, whToArchive.name);
      if (db && firebaseUser) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', String(warehouseToDelete)));
          } catch (e) { console.error("Firebase Depo Silme Hatası:", e); }
      } else {
          setWarehouses(warehouses.filter(w => w.id !== warehouseToDelete));
      }
      setIsDeleteWarehouseModalOpen(false);
      setWarehouseToDelete(null);
  };

  // Şube (depo) bilgisini WhatsApp'tan paylaş — yazılı adres + konum linki
  const handleShareWarehouse = (e, depo) => {
      if (e) e.stopPropagation();
      const mapLink = depo.mapLink || (depo.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(depo.address)}` : '');
      const text = `📍 *${depo.name}*\n\n${depo.address ? '🏢 Adres: ' + depo.address + '\n' : ''}${mapLink ? '\n🗺️ Konum: ' + mapLink : ''}\n\nDepoEvim`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const moveWarehouseUp = async (index, e) => {
    e.stopPropagation(); if (index === 0) return;
    const newWarehouses = [...warehouses];
    const temp = newWarehouses[index - 1];
    newWarehouses[index - 1] = newWarehouses[index];
    newWarehouses[index] = temp;
    setWarehouses(newWarehouses);
    if (db && firebaseUser) {
        for (let i = 0; i < newWarehouses.length; i++) {
            setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', String(newWarehouses[i].id)), { orderIndex: i }, { merge: true });
        }
    }
  };

  const moveWarehouseDown = async (index, e) => {
    e.stopPropagation(); if (index === warehouses.length - 1) return;
    const newWarehouses = [...warehouses];
    const temp = newWarehouses[index + 1];
    newWarehouses[index + 1] = newWarehouses[index];
    newWarehouses[index] = temp;
    setWarehouses(newWarehouses);
    if (db && firebaseUser) {
        for (let i = 0; i < newWarehouses.length; i++) {
            setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', String(newWarehouses[i].id)), { orderIndex: i }, { merge: true });
        }
    }
  };

  // --- BLOK LİSTESİ STATE'LERİ ---
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
  const [newBlockName, setNewBlockName] = useState('');
  const [newBlockM3, setNewBlockM3] = useState('');

  const [isDeleteBlockModalOpen, setIsDeleteBlockModalOpen] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState(null);

  const handleAddBlock = async () => {
      logActivity('Blok Ekleme', 'Yeni blok eklendi.');
      if(!checkActionPerm('action-blok-ekle')) return;
      if (!newBlockName || !selectedWarehouseId) return;
      const currentBlocks = blocks.filter(b => b.warehouseId === selectedWarehouseId);
      const newBlock = { id: Date.now(), warehouseId: selectedWarehouseId, name: newBlockName, m3: newBlockM3 || 0, orderIndex: currentBlocks.length };
      if (db && firebaseUser) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'blocks', String(newBlock.id)), newBlock);
      setIsAddBlockModalOpen(false); setNewBlockName(''); setNewBlockM3('');
  };

  const [isEditBlockModalOpen, setIsEditBlockModalOpen] = useState(false);
  const [editBlockData, setEditBlockData] = useState(null);

  const handleEditBlock = async () => {
      if(!checkActionPerm('action-blok-duzenle')) return;
      if (!editBlockData?.name) return;
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'blocks', String(editBlockData.id)), { name: editBlockData.name, m3: editBlockData.m3 }, { merge: true });
          } catch (e) { console.error("Firebase Blok Güncelleme Hatası:", e); }
      }
      setIsEditBlockModalOpen(false); setEditBlockData(null);
  };

  const handleDeleteBlockClick = (e, id) => {
      if(!checkActionPerm('action-blok-sil')) return;
      logActivity('Blok Silme', 'Depo listesinden bir blok silindi.');
      e.stopPropagation();
      setBlockToDelete(id);
      setIsDeleteBlockModalOpen(true);
  };

  const confirmDeleteBlock = async () => {
      if (!blockToDelete) return;
      // Silinen bloğu geri yükleme çöp kutusuna arşivle
      const blkToArchive = blocks.find(b => b.id === blockToDelete);
      if (blkToArchive) await archiveDeletedItem('Blok', 'blocks', blkToArchive, blkToArchive.name);
      if (db && firebaseUser) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'blocks', String(blockToDelete)));
          } catch (e) { console.error("Firebase Blok Silme Hatası:", e); }
      } else {
          setBlocks(blocks.filter(b => b.id !== blockToDelete));
      }
      setIsDeleteBlockModalOpen(false);
      setBlockToDelete(null);
  };

  const moveBlockUp = async (index, filteredList, e) => {
    e.stopPropagation(); if (index === 0) return;
    const newBlocks = [...blocks];
    const id1 = filteredList[index - 1].id; const id2 = filteredList[index].id;
    const idx1 = newBlocks.findIndex(b => b.id === id1); const idx2 = newBlocks.findIndex(b => b.id === id2);
    const temp = newBlocks[idx1]; newBlocks[idx1] = newBlocks[idx2]; newBlocks[idx2] = temp;
    setBlocks(newBlocks);

    const newFilteredList = [...filteredList];
    const tempF = newFilteredList[index - 1];
    newFilteredList[index - 1] = newFilteredList[index];
    newFilteredList[index] = tempF;

    if (db && firebaseUser) {
        for (let i = 0; i < newFilteredList.length; i++) {
            setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'blocks', String(newFilteredList[i].id)), { orderIndex: i }, { merge: true });
        }
    }
  };

  const moveBlockDown = async (index, filteredList, e) => {
    e.stopPropagation(); if (index === filteredList.length - 1) return;
    const newBlocks = [...blocks];
    const id1 = filteredList[index].id; const id2 = filteredList[index + 1].id;
    const idx1 = newBlocks.findIndex(b => b.id === id1); const idx2 = newBlocks.findIndex(b => b.id === id2);
    const temp = newBlocks[idx1]; newBlocks[idx1] = newBlocks[idx2]; newBlocks[idx2] = temp;
    setBlocks(newBlocks);

    const newFilteredList = [...filteredList];
    const tempF = newFilteredList[index + 1];
    newFilteredList[index + 1] = newFilteredList[index];
    newFilteredList[index] = tempF;

    if (db && firebaseUser) {
        for (let i = 0; i < newFilteredList.length; i++) {
            setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'blocks', String(newFilteredList[i].id)), { orderIndex: i }, { merge: true });
        }
    }
  };

  // --- ODA LİSTESİ STATE'LERİ ---
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomM3, setNewRoomM3] = useState('');
  // Yeni oda ölçüleri — en (genişlik), boy (uzunluk), yükseklik (metre)
  const [newRoomDims, setNewRoomDims] = useState({ width: '', length: '', height: '' });
  // KOLON (SÜTUN) DÜŞÜMÜ: bazı odaların içinde taşıyıcı kolon bulunur; bu hacim kullanılamaz.
  // Kolon ölçüleri girildiğinde hacmi hesaplanıp odanın toplam m³'ünden DÜŞÜLÜR.
  const [newRoomHasColumn, setNewRoomHasColumn] = useState(false);
  const [newRoomCol, setNewRoomCol] = useState({ width: '', length: '', height: '' });

  // Üç ölçüden hacim hesaplar (virgüllü girişleri de kabul eder). Geçersizse null döner.
  const calcVolume = (w, l, h) => {
      const a = [w, l, h].map(v => parseFloat(String(v ?? '').replace(',', '.')));
      if (!a.every(v => !isNaN(v) && v > 0)) return null;
      return Math.round(a[0] * a[1] * a[2] * 100) / 100;
  };

  const [isDeleteRoomModalOpen, setIsDeleteRoomModalOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState(null);

  const handleAddRoom = async () => {
      if(!checkActionPerm('action-yeni-oda')) return;
      logActivity('Oda Ekleme', `Yeni oda eklendi.`);
      if (!newRoomName || !selectedBlockId) return;
      const currentRooms = rooms.filter(r => r.blockId === selectedBlockId);

      // EN / BOY / YÜKSEKLİK ÖLÇÜLERİ + OTOMATİK m³ HESABI
      // Üç ölçü de girildiyse hacim otomatik hesaplanır (en × boy × yükseklik).
      // Odada KOLON varsa kolonun hacmi brüt hacimden DÜŞÜLÜR; kullanılabilir (net)
      // m³ kaydedilir. Ölçü girilmediyse elle yazılan m³ değeri aynen kullanılır.
      const _grossM3 = calcVolume(newRoomDims.width, newRoomDims.length, newRoomDims.height);
      const _colM3 = newRoomHasColumn ? calcVolume(newRoomCol.width, newRoomCol.length, newRoomCol.height) : null;
      // Net hacim negatif olamaz — kolon odadan büyük girilirse 0'a sabitlenir
      // Net hacim TAM SAYIYA yuvarlanır (0,20 altı aşağı / 0,21 üstü yukarı)
      const _autoM3 = _grossM3 != null
          ? roundRoomM3(Math.max(0, Math.round((_grossM3 - (_colM3 || 0)) * 100) / 100))
          : null;

      const newRoom = {
          id: Date.now(),
          blockId: selectedBlockId,
          name: newRoomName,
          customerName: null,
          m3: _autoM3 != null ? _autoM3 : (newRoomM3 || 0),
          // Ölçüler ayrı alanlarda saklanır; kartta ve oda içinde gösterilir
          width: _grossM3 != null ? parseFloat(String(newRoomDims.width).replace(',', '.')) : null,
          length: _grossM3 != null ? parseFloat(String(newRoomDims.length).replace(',', '.')) : null,
          height: _grossM3 != null ? parseFloat(String(newRoomDims.height).replace(',', '.')) : null,
          // Kolon bilgileri — brüt hacim ve düşülen kolon hacmi de saklanır
          hasColumn: !!(_colM3 != null),
          columnWidth: _colM3 != null ? parseFloat(String(newRoomCol.width).replace(',', '.')) : null,
          columnLength: _colM3 != null ? parseFloat(String(newRoomCol.length).replace(',', '.')) : null,
          columnHeight: _colM3 != null ? parseFloat(String(newRoomCol.height).replace(',', '.')) : null,
          columnM3: _colM3 != null ? _colM3 : null,
          grossM3: _grossM3 != null ? _grossM3 : null,
          isReserved: false,
          paidMonths: [],
          orderIndex: currentRooms.length
      };
      if (db && firebaseUser) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(newRoom.id)), newRoom);
      setIsAddRoomModalOpen(false); setNewRoomName(''); setNewRoomM3('');
      setNewRoomDims({ width: '', length: '', height: '' });
      setNewRoomHasColumn(false); setNewRoomCol({ width: '', length: '', height: '' });
  };

  const [isEditRoomModalOpen, setIsEditRoomModalOpen] = useState(false);
  const [editRoomData, setEditRoomData] = useState(null);

  const handleEditRoom = async () => {
      if (!editRoomData?.name) return;
      // Üç ölçü de girildiyse hacim otomatik hesaplanır; KOLON varsa hacmi düşülür.
      const _gross = calcVolume(editRoomData.width, editRoomData.length, editRoomData.height);
      const _col = editRoomData.hasColumn ? calcVolume(editRoomData.columnWidth, editRoomData.columnLength, editRoomData.columnHeight) : null;
      // Net hacim TAM SAYIYA yuvarlanır (0,20 altı aşağı / 0,21 üstü yukarı)
      const _net = _gross != null ? roundRoomM3(Math.max(0, Math.round((_gross - (_col || 0)) * 100) / 100)) : null;
      const _num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
      const _payload = {
          name: editRoomData.name,
          m3: _net != null ? _net : editRoomData.m3,
          width: _gross != null ? _num(editRoomData.width) : null,
          length: _gross != null ? _num(editRoomData.length) : null,
          height: _gross != null ? _num(editRoomData.height) : null,
          hasColumn: !!(_col != null),
          columnWidth: _col != null ? _num(editRoomData.columnWidth) : null,
          columnLength: _col != null ? _num(editRoomData.columnLength) : null,
          columnHeight: _col != null ? _num(editRoomData.columnHeight) : null,
          columnM3: _col != null ? _col : null,
          grossM3: _gross != null ? _gross : null
      };
      // Yerel state anında güncellenir
      setRooms(prev => prev.map(r => String(r.id) === String(editRoomData.id) ? { ...r, ..._payload } : r));
      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(editRoomData.id)), _payload, { merge: true });
          } catch (e) { console.error("Firebase Oda Güncelleme Hatası:", e); }
      }
      setIsEditRoomModalOpen(false); setEditRoomData(null);
  };

  const handleDeleteRoomClick = (e, id) => {
      if(!checkActionPerm('action-oda-sil')) return;
      logActivity('Oda Silme', 'Depo listesinden bir oda silindi.');
      e.stopPropagation();
      setRoomToDelete(id);
      setIsDeleteRoomModalOpen(true);
  };

  const confirmDeleteRoom = async () => {
      if (!roomToDelete) return;
      // Silinen odayı geri yükleme çöp kutusuna arşivle
      const roomToArchive = rooms.find(r => r.id === roomToDelete);
      if (roomToArchive) await archiveDeletedItem('Oda', 'rooms', roomToArchive, roomToArchive.name);
      if (db && firebaseUser) {
          try {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(roomToDelete)));
          } catch (e) { console.error("Firebase Oda Silme Hatası:", e); }
      } else {
          setRooms(rooms.filter(r => r.id !== roomToDelete));
      }
      setIsDeleteRoomModalOpen(false);
      setRoomToDelete(null);
  };

  const moveRoomUp = async (index, filteredList, e) => {
    e.stopPropagation(); if (index === 0) return;
    const newRooms = [...rooms];
    const id1 = filteredList[index - 1].id; const id2 = filteredList[index].id;
    const idx1 = newRooms.findIndex(r => r.id === id1); const idx2 = newRooms.findIndex(r => r.id === id2);
    const temp = newRooms[idx1]; newRooms[idx1] = newRooms[idx2]; newRooms[idx2] = temp; setRooms(newRooms);

    const newFilteredList = [...filteredList];
    const tempF = newFilteredList[index - 1];
    newFilteredList[index - 1] = newFilteredList[index];
    newFilteredList[index] = tempF;

    if (db && firebaseUser) {
        for (let i = 0; i < newFilteredList.length; i++) {
            setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(newFilteredList[i].id)), { orderIndex: i }, { merge: true });
        }
    }
  };

  const moveRoomDown = async (index, filteredList, e) => {
    e.stopPropagation(); if (index === filteredList.length - 1) return;
    const newRooms = [...rooms];
    const id1 = filteredList[index].id; const id2 = filteredList[index + 1].id;
    const idx1 = newRooms.findIndex(r => r.id === id1); const idx2 = newRooms.findIndex(r => r.id === id2);
    const temp = newRooms[idx1]; newRooms[idx1] = newRooms[idx2]; newRooms[idx2] = temp; setRooms(newRooms);

    const newFilteredList = [...filteredList];
    const tempF = newFilteredList[index + 1];
    newFilteredList[index + 1] = newFilteredList[index];
    newFilteredList[index] = tempF;

    if (db && firebaseUser) {
        for (let i = 0; i < newFilteredList.length; i++) {
            setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', String(newFilteredList[i].id)), { orderIndex: i }, { merge: true });
        }
    }
  };

  // Depo (şube) / blok kartı fotoğrafını (listPhoto) ekle-değiştir / sil
  const handleSetEntityPhoto = async (type, id, file) => {
      if (!file) return;
      const coll = type === 'warehouse' ? 'warehouses' : 'blocks';
      try {
          const url = await uploadImageToServer(file);
          if (db && firebaseUser) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, String(id)), { listPhoto: url }, { merge: true });
          } else if (type === 'warehouse') {
              setWarehouses(prev => prev.map(w => w.id === id ? { ...w, listPhoto: url } : w));
          } else {
              setBlocks(prev => prev.map(b => b.id === id ? { ...b, listPhoto: url } : b));
          }
      } catch (e) { console.error('Fotoğraf Yükleme Hatası:', e); }
  };
  const handleRemoveEntityPhoto = async (type, id) => {
      if (!window.confirm('Liste fotoğrafını kaldırmak istediğinize emin misiniz?')) return;
      const coll = type === 'warehouse' ? 'warehouses' : 'blocks';
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, String(id)), { listPhoto: null }, { merge: true }); } catch(e){ console.error(e); }
      } else if (type === 'warehouse') {
          setWarehouses(prev => prev.map(w => w.id === id ? { ...w, listPhoto: null } : w));
      } else {
          setBlocks(prev => prev.map(b => b.id === id ? { ...b, listPhoto: null } : b));
      }
  };

  const [entityPhotoViewer, setEntityPhotoViewer] = useState(null); // { type: 'warehouse' | 'block', id }

  // "Oda Boyutu Bul" — seçenekler ortada açılan pencerede (modal) gösterilir.
  // null = kapalı | { scope } = açık; scope butona basılan ekranı belirtir (null / {warehouseId} / {blockId})
  const [sizeFilterModal, setSizeFilterModal] = useState(null);

  // Bir oda, verilen kapsamın (şube/blok) içinde mi?
  const roomInScope = (r, scope) => {
      if (!scope) return true; // kapsam yok → tüm depolar
      if (scope.blockId) return r.blockId === scope.blockId;
      if (scope.warehouseId) {
          const blk = blocks.find(b => b.id === r.blockId);
          return blk?.warehouseId === scope.warehouseId;
      }
      return true;
  };

  const sizeFilters = [
      { id: '1+0', label: '1+0 (0 - 12 m³)', min: 0, max: 12 },
      { id: '1+1', label: '1+1 (13 - 18 m³)', min: 13, max: 18 },
      { id: '2+1', label: '2+1 (19 - 27 m³)', min: 19, max: 27 },
      { id: '3+1', label: '3+1 (28 - 37 m³)', min: 28, max: 37 },
      { id: '4+1', label: '4+1 ( 38+ m3 )', min: 38, max: Infinity }
  ];

  // --- ŞUBE KONTROL (TEMİZLİK / İLAÇLAMA / GENEL) STATE'LERİ ---
  const [inspectionTypeFilter, setInspectionTypeFilter] = useState('all');  // liste filtresi
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({
      type: 'temizlik',                                   // temizlik | ilaclama | genel
      date: new Date().toISOString().split('T')[0],
      company: '',                                        // yapan firma/kişi
      cost: '',                                           // varsa ücret
      nextDate: '',                                       // sonraki planlanan tarih
      note: ''
  });
  // YENİ: KONTROL BELGELERİ (ilaçlama firmasının verdiği rapor/sertifika: fotoğraf veya PDF)
  const [inspectionFiles, setInspectionFiles] = useState([]);          // modalda seçilen, henüz yüklenmemiş dosyalar (File[])
  const [inspectionUploading, setInspectionUploading] = useState(false); // kaydet/yükle sırasında butonları kilitler
  const [inspectionDocAddingId, setInspectionDocAddingId] = useState(null); // mevcut kayda belge eklenirken hangi kayıt

  // Seçilen dosyaları sunucuya yükleyip belge nesnelerine çevirir (icra dosyalarıyla aynı yapı)
  const uploadInspectionDocs = async (fileList) => {
      const out = [];
      for (const f of Array.from(fileList || [])) {
          try {
              const url = await uploadImageToServer(f);
              if (!url) continue;
              const kind = String(f.type || '') === 'application/pdf' || /\.pdf$/i.test(f.name || '') ? 'pdf' : 'image';
              out.push({ id: `idoc_${Date.now()}_${Math.floor(Math.random() * 10000)}`, name: f.name, url, kind, addedBy: currentUserProfile?.name || '', addedAt: Date.now() });
          } catch (e) { console.error('Kontrol belgesi yükleme hatası:', e); }
      }
      return out;
  };

  // Mevcut bir kontrol kaydına SONRADAN belge ekler (firma raporu birkaç gün sonra gönderebilir)
  const handleAddInspectionDocs = async (inspId, fileList) => {
      if (!fileList || fileList.length === 0) return;
      setInspectionDocAddingId(inspId);
      const added = await uploadInspectionDocs(fileList);
      setInspectionDocAddingId(null);
      if (added.length === 0) { alert('Belge yüklenemedi, lütfen tekrar deneyin.'); return; }
      setInspections(prev => prev.map(i => String(i.id) === String(inspId) ? { ...i, documents: [...(i.documents || []), ...added] } : i));
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inspections', String(inspId)), { documents: arrayUnion(...added) }, { merge: true }); } catch (e) { console.error('Kontrol belgesi kaydetme hatası:', e); }
      }
      logActivity('Şube Kontrol', `Kontrol kaydına ${added.length} belge eklendi.`);
  };

  // Kayıttan belge kaldırır
  const handleRemoveInspectionDoc = async (inspId, docId) => {
      if (!window.confirm('Bu belgeyi kaldırmak istediğinize emin misiniz?')) return;
      const insp = (inspections || []).find(i => String(i.id) === String(inspId));
      if (!insp) return;
      const next = (insp.documents || []).filter(d => String(d.id) !== String(docId));
      setInspections(prev => prev.map(i => String(i.id) === String(inspId) ? { ...i, documents: next } : i));
      if (db && firebaseUser) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inspections', String(inspId)), { documents: next }, { merge: true }); } catch (e) { console.error('Kontrol belgesi silme hatası:', e); }
      }
  };

  // Kontrol türleri — renk/etiket tanımları tek yerden yönetilir
  const inspectionTypes = {
      temizlik: { label: 'Temizlik',      color: 'bg-blue-500',   text: 'text-blue-600',   bgLight: 'bg-blue-50',   border: 'border-blue-200',   icon: Box },
      ilaclama: { label: 'İlaçlama',      color: 'bg-emerald-500',text: 'text-emerald-600',bgLight: 'bg-emerald-50',border: 'border-emerald-200', icon: Shield },
      genel:    { label: 'Genel Kontrol', color: 'bg-orange-500', text: 'text-orange-600', bgLight: 'bg-orange-50', border: 'border-orange-200', icon: Check }
  };

  const handleSaveInspection = async () => {
      if (!inspectionWarehouseId || !inspectionForm.date) return;
      const wh = warehouses.find(w => String(w.id) === String(inspectionWarehouseId));
      // YENİ: Seçilen belgeler (foto/PDF) önce yüklenir, sonra kayda eklenir
      setInspectionUploading(true);
      const _docs = inspectionFiles.length > 0 ? await uploadInspectionDocs(inspectionFiles) : [];
      setInspectionUploading(false);
      const record = {
          id: `insp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          warehouseId: inspectionWarehouseId,
          warehouseName: wh?.name || '',
          type: inspectionForm.type,
          date: inspectionForm.date,
          company: inspectionForm.company || '',
          cost: inspectionForm.cost !== '' ? Number(inspectionForm.cost) : null,
          nextDate: inspectionForm.nextDate || '',
          note: inspectionForm.note || '',
          notes: [],                                        // sonradan eklenen ek notlar
          documents: _docs,                                 // YENİ: firma belgeleri (foto / PDF)
          createdBy: currentUserProfile?.name || 'Sistem',
          createdByRole: getCurrentRole()?.name || currentUserProfile?.role || '',
          createdAt: Date.now()
      };

      if (db && firebaseUser) {
          try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inspections', record.id), record);
          } catch (e) { console.error('Kontrol Kaydı Hatası:', e); }
      }
      // Yerel listeye de ekle (önizleme ve anında görünürlük için)
      setInspections(prev => [record, ...prev]);
      logActivity('Şube Kontrol', `${wh?.name || ''} şubesine ${inspectionTypes[record.type]?.label} kaydı eklendi.`);

      // Formu sıfırla ve pencereyi kapat
      setInspectionForm({ type: 'temizlik', date: new Date().toISOString().split('T')[0], company: '', cost: '', nextDate: '', note: '' });
      setInspectionFiles([]);
      setIsInspectionModalOpen(false);
  };

  // Var olan bir kontrol kaydına SONRADAN not ekler (kayıt geçmişi bozulmaz).
  const handleAddInspectionNote = async (inspId, text) => {
      if (!text || !text.trim()) return;
      const entry = {
          id: `n_${Date.now()}`,
          text: text.trim(),
          by: currentUserProfile?.name || 'Sistem',
          at: Date.now()
      };
      if (db && firebaseUser) {
          try {
              // arrayUnion ile ATOMİK ekleme — başka kullanıcının aynı anda eklediği not EZİLMEZ.
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inspections', String(inspId)), { notes: arrayUnion(entry) }, { merge: true });
          } catch (e) { console.error('Not Ekleme Hatası:', e); }
      }
      setInspections(prev => prev.map(i => String(i.id) === String(inspId) ? { ...i, notes: [...(i.notes || []), entry] } : i));
  };

  // Kontrol kaydını siler (onaylı).
  const handleDeleteInspection = async (inspId) => {
      if (!window.confirm('Bu kontrol kaydını silmek istediğinize emin misiniz?')) return;
      if (db && firebaseUser) {
          try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inspections', String(inspId))); } catch (e) { console.error('Kontrol Silme Hatası:', e); }
      }
      setInspections(prev => prev.filter(i => String(i.id) !== String(inspId)));
      logActivity('Şube Kontrol', 'Bir kontrol kaydı silindi.');
  };

  // Bir şubenin son kontrol tarihini türe göre döndürür (kart üzerinde uyarı için).
  const getLastInspection = (whId, type) => {
      const list = (inspections || [])
          .filter(i => String(i.warehouseId) === String(whId) && i.type === type)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      return list[0] || null;
  };

  // ══════════════════════════════════════════════════════════════════════
  // ŞUBE KONTROL KAYITLARI SAYFASI
  // ══════════════════════════════════════════════════════════════════════
  if (activeMenu === 'sube-kontrol') {
    return (
      <>
        {(() => {
            const wh = warehouses.find(w => String(w.id) === String(inspectionWarehouseId));
            // Bu şubeye ait kayıtlar — en yeni tarih en üstte
            const all = (inspections || [])
                .filter(i => String(i.warehouseId) === String(inspectionWarehouseId))
                .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
            const list = inspectionTypeFilter === 'all' ? all : all.filter(i => i.type === inspectionTypeFilter);

            return (
            <div className="max-w-6xl mx-auto animate-in fade-in duration-300 pb-10">
                {/* ÜST BAŞLIK — geri dön + şube adı + yeni kayıt butonu */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
                    <button onClick={() => { setInspectionWarehouseId(null); setActiveMenu('depo'); }} className="text-xs font-bold text-gray-500 hover:text-indigo-600 tracking-wider uppercase mb-3 flex items-center gap-1 transition-colors">
                        <ArrowLeft size={14} /> Depo Listesine Dön
                    </button>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-md shrink-0">
                                <Shield size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{wh?.name || 'Şube'}</h2>
                                <p className="text-xs text-gray-500 font-semibold">Temizlik · İlaçlama · Genel Kontrol Kayıtları</p>
                            </div>
                        </div>
                        <button onClick={() => { setInspectionForm({ type: 'temizlik', date: new Date().toISOString().split('T')[0], company: '', cost: '', nextDate: '', note: '' }); setInspectionFiles([]); setIsInspectionModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 transition-colors">
                            <Plus size={18} /> Yeni Kontrol Kaydı
                        </button>
                    </div>
                </div>

                {/* ÖZET KARTLAR — her tür için son yapılan tarih ve sonraki plan */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                    {Object.keys(inspectionTypes).map(tKey => {
                        const t = inspectionTypes[tKey];
                        const last = getLastInspection(inspectionWarehouseId, tKey);
                        const daysPassed = last ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000) : null;
                        const stale = daysPassed === null || daysPassed > 90; // 90 gün kuralı
                        const TIcon = t.icon;
                        return (
                            <div key={tKey} className={`bg-white rounded-2xl border-2 ${stale ? 'border-red-200' : t.border} p-4 shadow-sm`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`w-9 h-9 rounded-lg ${t.color} text-white flex items-center justify-center shadow-sm`}><TIcon size={16} /></div>
                                    <span className={`font-bold text-sm ${t.text}`}>{t.label}</span>
                                </div>
                                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wide">Son Yapılan</p>
                                <p className={`text-lg font-black ${stale ? 'text-red-500' : 'text-slate-800'}`}>
                                    {last ? new Date(last.date).toLocaleDateString('tr-TR') : 'Kayıt Yok'}
                                </p>
                                {daysPassed !== null && (
                                    <p className={`text-[11px] font-bold mt-0.5 ${stale ? 'text-red-500' : 'text-gray-400'}`}>
                                        {daysPassed} gün önce {stale && '— kontrol zamanı geçti!'}
                                    </p>
                                )}
                                {last?.nextDate && (
                                    <p className="text-[11px] font-bold text-indigo-500 mt-1.5 flex items-center gap-1">
                                        <Calendar size={11} /> Sonraki: {new Date(last.nextDate).toLocaleDateString('tr-TR')}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* FİLTRE SATIRI */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 mb-5 flex flex-wrap items-center gap-2">
                    <button onClick={() => setInspectionTypeFilter('all')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${inspectionTypeFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                        Tümü ({all.length})
                    </button>
                    {Object.keys(inspectionTypes).map(tKey => {
                        const t = inspectionTypes[tKey];
                        const cnt = all.filter(i => i.type === tKey).length;
                        return (
                            <button key={tKey} onClick={() => setInspectionTypeFilter(tKey)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${inspectionTypeFilter === tKey ? `${t.color} text-white shadow-sm` : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                {t.label} ({cnt})
                            </button>
                        );
                    })}
                </div>

                {/* GEÇMİŞ KAYIT LİSTESİ */}
                <div className="flex flex-col gap-4">
                    {list.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4"><Shield size={28} className="text-gray-300" /></div>
                            <h3 className="text-lg font-bold text-gray-700 mb-1">Henüz kontrol kaydı yok</h3>
                            <p className="text-sm text-gray-500">Bu şube için ilk temizlik, ilaçlama veya genel kontrol kaydını oluşturun.</p>
                        </div>
                    ) : list.map(insp => {
                        const t = inspectionTypes[insp.type] || inspectionTypes.genel;
                        const TIcon = t.icon;
                        return (
                            <div key={insp.id} className={`bg-white rounded-2xl border ${t.border} shadow-sm overflow-hidden`}>
                                {/* Kayıt üst bilgi */}
                                <div className={`${t.bgLight} px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b ${t.border}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl ${t.color} text-white flex items-center justify-center shadow-sm shrink-0`}><TIcon size={18} /></div>
                                        <div>
                                            <span className={`font-black text-sm ${t.text} uppercase tracking-tight`}>{t.label}</span>
                                            <p className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                                                <Calendar size={11} /> {new Date(insp.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {insp.cost != null && <span className="bg-white border border-gray-200 px-2.5 py-1 rounded-lg text-xs font-black text-slate-700 shadow-sm">{Number(insp.cost).toLocaleString('tr-TR')} TL</span>}
                                        <button onClick={() => handleDeleteInspection(insp.id)} className="bg-white hover:bg-red-50 text-red-500 p-2 rounded-lg border border-red-100 shadow-sm transition-colors" title="Kaydı Sil"><Trash2 size={14} /></button>
                                    </div>
                                </div>

                                {/* Kayıt detayları */}
                                <div className="p-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Yapan Firma / Kişi</p>
                                            <p className="text-sm font-bold text-slate-700">{insp.company || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Sonraki Planlanan</p>
                                            <p className="text-sm font-bold text-slate-700">{insp.nextDate ? new Date(insp.nextDate).toLocaleDateString('tr-TR') : '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Kaydı Açan</p>
                                            <p className="text-sm font-bold text-slate-700 flex items-center gap-1"><UserCog size={13} className="text-indigo-500" /> {insp.createdBy || 'Bilinmiyor'}</p>
                                        </div>
                                    </div>

                                    {/* Ana açıklama */}
                                    {insp.note && (
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Açıklama</p>
                                            <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">{insp.note}</p>
                                        </div>
                                    )}

                                    {/* YENİ: BELGELER (firma raporu, fotoğraf, PDF) + sonradan belge ekleme */}
                                    <div className={`rounded-xl border p-3 mb-4 ${insp.type === 'ilaclama' ? 'bg-emerald-50/40 border-emerald-100' : 'bg-gray-50/60 border-gray-100'}`}>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{insp.type === 'ilaclama' ? 'İlaçlama Belgeleri' : 'Belgeler'} ({(insp.documents || []).length})</p>
                                            <label className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${inspectionDocAddingId === insp.id ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}>
                                                <Upload size={12} /> {inspectionDocAddingId === insp.id ? 'Yükleniyor...' : 'Belge Ekle'}
                                                <input type="file" multiple accept="image/*,application/pdf" className="hidden" disabled={inspectionDocAddingId === insp.id} onChange={(e) => { const f = e.target.files; handleAddInspectionDocs(insp.id, Array.from(f || [])); e.target.value = ''; }} />
                                            </label>
                                        </div>
                                        {(insp.documents || []).length === 0 ? (
                                            <p className="text-[11px] text-gray-400 font-medium">Henüz belge eklenmemiş.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {insp.documents.map(d => (
                                                    <div key={d.id} className="relative group w-24">
                                                        <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.name} className="block w-24 h-24 rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-emerald-400 transition-colors">
                                                            {d.kind === 'pdf' ? (
                                                                <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-rose-50 text-rose-600"><span className="text-lg font-black">PDF</span><span className="text-[9px] font-bold px-1 truncate w-full text-center">{d.name}</span></div>
                                                            ) : (
                                                                <img src={d.url} alt={d.name} className="w-full h-full object-cover" />
                                                            )}
                                                        </a>
                                                        <button onClick={() => handleRemoveInspectionDoc(insp.id, d.id)} title="Belgeyi kaldır" className="absolute -top-1.5 -right-1.5 bg-white border border-red-200 text-red-500 rounded-full p-0.5 shadow-sm opacity-80 hover:opacity-100"><X size={12} /></button>
                                                        <p className="text-[9px] text-gray-400 mt-0.5 truncate">{d.addedBy} • {new Date(d.addedAt).toLocaleDateString('tr-TR')}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* SONRADAN EKLENEN NOTLAR */}
                                    {(insp.notes || []).length > 0 && (
                                        <div className="flex flex-col gap-2 mb-4">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Notlar ({(insp.notes || []).length})</p>
                                            {(insp.notes || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0)).map(n => (
                                                <div key={n.id} className="bg-indigo-50/60 border-l-4 border-indigo-400 rounded-r-lg px-3 py-2">
                                                    <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">{n.text}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold mt-1">{n.by} · {n.at ? new Date(n.at).toLocaleString('tr-TR') : ''}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* NOT EKLEME ALANI — her kayda ayrı ayrı not eklenir */}
                                    <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-gray-100">
                                        <input
                                            type="text"
                                            placeholder="Bu kontrole not ekle (örn: 3. kat tekrar ilaçlanacak)"
                                            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                    handleAddInspectionNote(insp.id, e.currentTarget.value);
                                                    e.currentTarget.value = '';
                                                }
                                            }}
                                            id={`note-input-${insp.id}`}
                                        />
                                        <button
                                            onClick={() => {
                                                const el = document.getElementById(`note-input-${insp.id}`);
                                                if (el && el.value.trim()) { handleAddInspectionNote(insp.id, el.value); el.value = ''; }
                                            }}
                                            className="bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 border border-indigo-200 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5 shrink-0"
                                        >
                                            <Plus size={15} /> Not Ekle
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            );
        })()}

        {isInspectionModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setIsInspectionModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              {/* Pencere başlığı */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><Shield size={17} /></div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">Yeni Kontrol Kaydı</h3>
                    <p className="text-[11px] text-gray-500 font-semibold">{warehouses.find(w => String(w.id) === String(inspectionWarehouseId))?.name || ''}</p>
                  </div>
                </div>
                <button onClick={() => setIsInspectionModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1"><X size={22} /></button>
              </div>

              <div className="p-6 flex flex-col gap-5">
                {/* TÜR SEÇİMİ — üç büyük seçim butonu */}
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 block">Kontrol Türü</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(inspectionTypes).map(tKey => {
                      const t = inspectionTypes[tKey];
                      const TIcon = t.icon;
                      const active = inspectionForm.type === tKey;
                      return (
                        <button key={tKey} onClick={() => setInspectionForm({ ...inspectionForm, type: tKey })} className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${active ? `${t.color} text-white border-transparent shadow-md` : `bg-gray-50 ${t.text} border-gray-200 hover:border-gray-300`}`}>
                          <TIcon size={20} />
                          <span className="text-[11px] font-bold">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* TARİH ve SONRAKİ PLAN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Yapıldığı Tarih</label>
                    <input type="date" value={inspectionForm.date} onChange={(e) => setInspectionForm({ ...inspectionForm, date: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-semibold text-slate-700" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Sonraki Plan (opsiyonel)</label>
                    <input type="date" value={inspectionForm.nextDate} onChange={(e) => setInspectionForm({ ...inspectionForm, nextDate: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-semibold text-slate-700" />
                  </div>
                </div>

                {/* FİRMA ve ÜCRET */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Yapan Firma / Kişi</label>
                    <input type="text" value={inspectionForm.company} onChange={(e) => setInspectionForm({ ...inspectionForm, company: e.target.value })} placeholder="Örn: ABC İlaçlama Ltd." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-semibold text-slate-700" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Ücret (TL, opsiyonel)</label>
                    <input type="number" value={inspectionForm.cost} onChange={(e) => setInspectionForm({ ...inspectionForm, cost: e.target.value })} placeholder="0" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-semibold text-slate-700" />
                  </div>
                </div>

                {/* AÇIKLAMA */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Açıklama / Yapılan İşlemler</label>
                  <textarea value={inspectionForm.note} onChange={(e) => setInspectionForm({ ...inspectionForm, note: e.target.value })} rows={4} placeholder="Örn: Tüm koridorlar ve ortak alanlar temizlendi. B blok zemininde nem tespit edildi." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium text-slate-700 resize-none" />
                </div>

                {/* YENİ: BELGE EKLE (Fotoğraf / PDF) — İlaçlama seçiliyse firma raporu için vurgulanır, diğer türlerde de kullanılabilir */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    {inspectionForm.type === 'ilaclama' ? 'İlaçlama Belgesi / Firma Raporu (Fotoğraf veya PDF)' : 'Belge / Fotoğraf (Opsiyonel)'}
                  </label>
                  <label className={`flex flex-col items-center justify-center gap-1.5 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${inspectionForm.type === 'ilaclama' ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500'}`}>
                    <Upload size={20} />
                    <span className="text-xs font-bold">Dosya seçin veya fotoğraf çekin</span>
                    <span className="text-[10px] font-medium opacity-70">JPG, PNG, PDF • Birden fazla seçilebilir</span>
                    <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; setInspectionFiles(prev => [...prev, ...f]); }} />
                  </label>
                  {inspectionFiles.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {inspectionFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${String(f.type) === 'application/pdf' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}>{String(f.type) === 'application/pdf' ? 'PDF' : 'FOTO'}</span>
                          <span className="text-xs font-bold text-slate-700 truncate flex-1">{f.name}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                          <button onClick={() => setInspectionFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Pencere alt butonları */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
                <button onClick={() => setIsInspectionModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold text-sm transition-colors">İptal</button>
                <button onClick={handleSaveInspection} disabled={!inspectionForm.date || inspectionUploading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30">
                  <Check size={17} /> {inspectionUploading ? 'Belgeler yükleniyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // DEPO LİSTESİ (ŞUBE → BLOK → ODA GEZİNME) SAYFASI
  // ══════════════════════════════════════════════════════════════════════
  return (
    <>
      <div className="max-w-7xl mx-auto flex flex-col h-full bg-slate-50 relative">
        {activeSizeFilter ? (
           <div className="animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-purple-200 bg-purple-50/30">
                  <div>
                      <button onClick={() => { setActiveSizeFilter(null); setSizeFilterScope(null); }} className="text-xs font-bold text-gray-500 hover:text-purple-600 tracking-wider uppercase mb-1 flex items-center gap-1 transition-colors"><ArrowLeft size={14} /> Geri Dön</button>
                      <h2 className="text-2xl font-bold text-purple-900">Boş Oda Arama: {sizeFilters.find(f => f.id === activeSizeFilter)?.label}
                         {sizeFilterScope?.blockId && <span className="text-sm font-bold text-purple-500 ml-2">({blocks.find(b => b.id === sizeFilterScope.blockId)?.name} içinde)</span>}
                         {sizeFilterScope?.warehouseId && !sizeFilterScope?.blockId && <span className="text-sm font-bold text-purple-500 ml-2">({warehouses.find(w => w.id === sizeFilterScope.warehouseId)?.name} içinde)</span>}
                      </h2>
                  </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-6 pb-8">
                  {(() => {
                      const filterOpt = sizeFilters.find(f => f.id === activeSizeFilter);
                      const filteredEmptyRooms = rooms.filter(r => {
                          const isEmpty = !r.customerName && (!r.isReserved || r.reserveExpiryTimestamp < Date.now());
                          const m3 = Number(r.m3 || 0);
                          // Kapsam kontrolü — butona basılan ekrana (şube/blok) göre daraltılır
                          return isEmpty && m3 >= filterOpt.min && m3 <= filterOpt.max && roomInScope(r, sizeFilterScope);
                      });

                      if (filteredEmptyRooms.length === 0) {
                          return (
                              <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300 shadow-sm">
                                  <Search size={40} className="mx-auto text-gray-300 mb-4" />
                                  <h3 className="text-lg font-bold text-gray-700">Bu Kriterlere Uygun Boş Oda Bulunamadı</h3>
                                  <p className="text-sm text-gray-500 mt-1">Seçtiğiniz m³ aralığında tamamen boş olan bir oda mevcut değil.</p>
                              </div>
                          );
                      }

                      return filteredEmptyRooms.map((oda) => {
                          const block = blocks.find(b => b.id === oda.blockId);
                          const warehouse = warehouses.find(w => w.id === block?.warehouseId);

                          return (
                              <div key={oda.id} onClick={() => {
                                  setSelectedWarehouseId(warehouse?.id);
                                  setSelectedBlockId(block?.id);
                                  setSelectedRoomId(oda.id);
                                  setActiveSizeFilter(null);
                                  setSizeFilterScope(null);
                              }} className="relative rounded-xl overflow-hidden shadow-sm group hover:shadow-xl transition-all transform hover:-translate-y-1 cursor-pointer bg-white border border-gray-300 flex flex-col">
                                  <div className="px-3 sm:px-4 py-2.5 flex items-center bg-[#1bc5bd] text-white shadow-md z-10">
                                      <div className="flex flex-col min-w-0 w-full gap-1">
                                          <div className="flex items-center justify-between gap-2 min-w-0">
                                              <h3 className="font-black text-lg sm:text-xl tracking-wide leading-none drop-shadow-sm truncate min-w-0">{oda.name}</h3>
                                              <span className="text-[10px] font-bold bg-black/25 px-2 py-1 rounded shadow-inner shrink-0 whitespace-nowrap">{displayRoomM3(oda)} m³</span>
                                          </div>
                                          <div className="flex items-center justify-between gap-2 min-w-0">
                                              <span className="text-[9px] opacity-90 font-medium truncate min-w-0" title={`${warehouse?.name} - ${block?.name}`}>{warehouse?.name} - {block?.name}</span>
                                              {formatRoomDims(oda) && <span className="text-[9px] font-bold bg-black/15 px-1.5 py-0.5 rounded shadow-inner shrink-0 whitespace-nowrap" title="En × Boy × Yükseklik">{formatRoomDims(oda)}</span>}
                                          </div>
                                      </div>
                                  </div>
                                  <div className="flex-1 relative flex flex-col justify-center items-center min-h-[140px]"
                                      style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #f8fafc, #f8fafc 12px, #e2e8f0 12px, #e2e8f0 14px)' }}>
                                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-10 h-3 bg-slate-300 border border-slate-400 rounded-sm flex items-center justify-center shadow-sm">
                                          <div className="w-3 h-1 bg-slate-500 rounded-full"></div>
                                      </div>
                                      <div className="px-3 py-2 rounded-lg border-2 shadow-sm font-bold uppercase text-[11px] text-center max-w-[90%] truncate bg-white text-teal-600 border-teal-200">
                                          BOŞ ODA
                                      </div>
                                  </div>
                              </div>
                          );
                      });
                  })()}
              </div>
           </div>
        ) : showReservedView ? (
           /* REZERVE GÖSTER görünümü — kapsamına (tümü/şube/blok) göre rezerveli odaları listeler */
           <div className="animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-orange-200 bg-orange-50/30">
                  <div>
                      <button onClick={() => { setShowReservedView(false); setReservedViewScope(null); }} className="text-xs font-bold text-gray-500 hover:text-orange-600 tracking-wider uppercase mb-1 flex items-center gap-1 transition-colors"><ArrowLeft size={14} /> Geri Dön</button>
                      <h2 className="text-2xl font-bold text-orange-700">Rezerveli Odalar
                         {reservedViewScope?.blockId && <span className="text-sm font-bold text-orange-500 ml-2">({blocks.find(b => b.id === reservedViewScope.blockId)?.name} içinde)</span>}
                         {reservedViewScope?.warehouseId && !reservedViewScope?.blockId && <span className="text-sm font-bold text-orange-500 ml-2">({warehouses.find(w => w.id === reservedViewScope.warehouseId)?.name} içinde)</span>}
                      </h2>
                  </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-6 pb-8">
                  {(() => {
                      // Geçerli (süresi dolmamış) rezerveler, kapsam dahilinde
                      const reservedRooms = rooms.filter(r => r.isReserved && (!r.reserveExpiryTimestamp || r.reserveExpiryTimestamp > Date.now()) && roomInScope(r, reservedViewScope));

                      if (reservedRooms.length === 0) {
                          return (
                              <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300 shadow-sm">
                                  <Clock size={40} className="mx-auto text-gray-300 mb-4" />
                                  <h3 className="text-lg font-bold text-gray-700">Rezerveli Oda Bulunamadı</h3>
                                  <p className="text-sm text-gray-500 mt-1">Bu kapsamda aktif rezervasyonu olan bir oda mevcut değil.</p>
                              </div>
                          );
                      }

                      return reservedRooms.map((oda) => {
                          const block = blocks.find(b => b.id === oda.blockId);
                          const warehouse = warehouses.find(w => w.id === block?.warehouseId);
                          return (
                              <div key={oda.id} onClick={() => {
                                  setSelectedWarehouseId(warehouse?.id);
                                  setSelectedBlockId(block?.id);
                                  setSelectedRoomId(oda.id);
                                  setShowReservedView(false);
                                  setReservedViewScope(null);
                              }} className="relative rounded-xl overflow-hidden shadow-sm group hover:shadow-xl transition-all transform hover:-translate-y-1 cursor-pointer bg-white border border-gray-300 flex flex-col">
                                  <div className="px-3 sm:px-4 py-2.5 flex items-center bg-orange-500 text-white shadow-md z-10">
                                      <div className="flex flex-col min-w-0 w-full gap-1">
                                          <div className="flex items-center justify-between gap-2 min-w-0">
                                              <h3 className="font-black text-lg sm:text-xl tracking-wide leading-none drop-shadow-sm truncate min-w-0">{oda.name}</h3>
                                              <span className="text-[10px] font-bold bg-black/25 px-2 py-1 rounded shadow-inner shrink-0 whitespace-nowrap">{displayRoomM3(oda)} m³</span>
                                          </div>
                                          <div className="flex items-center justify-between gap-2 min-w-0">
                                              <span className="text-[9px] opacity-90 font-medium truncate min-w-0" title={`${warehouse?.name} - ${block?.name}`}>{warehouse?.name} - {block?.name}</span>
                                              {formatRoomDims(oda) && <span className="text-[9px] font-bold bg-black/15 px-1.5 py-0.5 rounded shadow-inner shrink-0 whitespace-nowrap" title="En × Boy × Yükseklik">{formatRoomDims(oda)}</span>}
                                          </div>
                                      </div>
                                  </div>
                                  <div className="flex-1 relative flex flex-col justify-center items-center gap-2 min-h-[150px] p-3"
                                      style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #f8fafc, #f8fafc 12px, #e2e8f0 12px, #e2e8f0 14px)' }}>
                                      <div className="px-3 py-2 rounded-lg border-2 shadow-sm font-bold uppercase text-[11px] text-center max-w-[90%] truncate bg-orange-50 text-orange-600 border-orange-200 z-10">
                                          REZERVELİ
                                      </div>
                                      {oda.reservedName && <div className="text-xs font-bold text-gray-700 bg-white/90 px-2 py-1 rounded shadow-sm z-10 truncate max-w-[90%]">{oda.reservedName}</div>}
                                      {oda.reserveExpiry && <div className="text-[10px] font-semibold text-orange-600 bg-white/90 px-2 py-0.5 rounded shadow-sm z-10">Bitiş: {oda.reserveExpiry}</div>}
                                  </div>
                              </div>
                          );
                      });
                  })()}
              </div>
           </div>
        ) : !selectedWarehouseId ? (
          <>
            <div className="flex justify-between items-center mb-2 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex-col sm:flex-row gap-4 sm:gap-0">
              <h2 className="text-2xl font-bold text-slate-800">Depo Listesi</h2>
              <div className="flex flex-nowrap items-center gap-2">
                  <button onClick={() => setSizeFilterModal({ scope: null })} className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all shadow-md shadow-purple-500/30 whitespace-nowrap">
                      <Search size={14} /> Oda Boyutu Bul
                  </button>
                  <button onClick={() => { setShowReservedView(true); setReservedViewScope(null); }} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors shadow-md shadow-orange-500/30 whitespace-nowrap">
                      <Clock size={14} /> Rezerve Göster
                  </button>
                  <button onClick={() => setIsAddWarehouseModalOpen(true)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors shadow-sm whitespace-nowrap">Depo Ekle <Plus size={14} /></button>
              </div>
            </div>
            {bulkM3Result && (
              <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-bold border ${bulkM3Result.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                {bulkM3Result}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-8">
            {warehouses.map((depo, index) => {
              const stats = getWarehouseStats(depo.id);
              const occupied = getWarehouseOccupiedM3(depo.id);
              const capacity = getWarehouseCapacityM3(depo.id);
              const percentage = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;

              const wColor = [
                { border: 'border-blue-200', bg: 'bg-blue-50/30', roof: 'bg-blue-700', roofAcc: 'bg-blue-600', bar: 'bg-blue-500', hover: 'hover:border-blue-400', iconBg: 'bg-blue-100', text: 'text-blue-700' },
                { border: 'border-emerald-200', bg: 'bg-emerald-50/30', roof: 'bg-emerald-700', roofAcc: 'bg-emerald-600', bar: 'bg-emerald-500', hover: 'hover:border-emerald-400', iconBg: 'bg-emerald-100', text: 'text-emerald-700' },
                { border: 'border-amber-200', bg: 'bg-amber-50/30', roof: 'bg-amber-600', roofAcc: 'bg-amber-500', bar: 'bg-amber-500', hover: 'hover:border-amber-400', iconBg: 'bg-amber-100', text: 'text-amber-700' },
                { border: 'border-purple-200', bg: 'bg-purple-50/30', roof: 'bg-purple-700', roofAcc: 'bg-purple-600', bar: 'bg-purple-500', hover: 'hover:border-purple-400', iconBg: 'bg-purple-100', text: 'text-purple-700' },
                { border: 'border-rose-200', bg: 'bg-rose-50/30', roof: 'bg-rose-700', roofAcc: 'bg-rose-600', bar: 'bg-rose-500', hover: 'hover:border-rose-400', iconBg: 'bg-rose-100', text: 'text-rose-700' },
                { border: 'border-cyan-200', bg: 'bg-cyan-50/30', roof: 'bg-cyan-700', roofAcc: 'bg-cyan-600', bar: 'bg-cyan-500', hover: 'hover:border-cyan-400', iconBg: 'bg-cyan-100', text: 'text-cyan-700' },
                { border: 'border-fuchsia-200', bg: 'bg-fuchsia-50/30', roof: 'bg-fuchsia-700', roofAcc: 'bg-fuchsia-600', bar: 'bg-fuchsia-500', hover: 'hover:border-fuchsia-400', iconBg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
                { border: 'border-teal-200', bg: 'bg-teal-50/30', roof: 'bg-teal-700', roofAcc: 'bg-teal-600', bar: 'bg-teal-500', hover: 'hover:border-teal-400', iconBg: 'bg-teal-100', text: 'text-teal-700' },
              ][index % 8];

              return (
              <div key={depo.id} onClick={() => setSelectedWarehouseId(depo.id)} className={`bg-white rounded-2xl shadow-sm hover:shadow-xl border-2 ${wColor.border} ${wColor.hover} relative transition-all duration-300 cursor-pointer group flex flex-col overflow-hidden transform hover:-translate-y-1`}>
                <div className={`h-4 w-full ${wColor.roof} relative`}>
                   <div className={`absolute top-0 left-4 w-12 h-6 ${wColor.roofAcc} rounded-b-md`}></div>
                   <div className={`absolute top-0 right-4 w-12 h-6 ${wColor.roofAcc} rounded-b-md`}></div>
                </div>

                <div className={`p-6 flex-1 flex flex-col ${wColor.bg}`}>
                  <div className="flex justify-between items-center mb-4 z-10" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setEntityPhotoViewer({ type: 'warehouse', id: depo.id }); }} className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center shadow-md ring-2 ring-white/70 transition-all hover:scale-105" title="Depo Fotoğrafı"><Eye size={15} /></button>
                    <div className="flex gap-1 bg-white/80 border border-slate-200 rounded-full px-1.5 py-1 shadow-sm" title="Sırayı Değiştir">
                      <button onClick={(e) => moveWarehouseUp(index, e)} disabled={index === 0} className="hover:bg-slate-100 text-slate-500 p-1 rounded-full transition-colors disabled:opacity-30"><ArrowUp size={13} /></button>
                      <button onClick={(e) => moveWarehouseDown(index, e)} disabled={index === warehouses.length - 1} className="hover:bg-slate-100 text-slate-500 p-1 rounded-full transition-colors disabled:opacity-30"><ArrowDown size={13} /></button>
                    </div>
                    <button onClick={(e) => handleDeleteWarehouseClick(e, depo.id)} className="w-9 h-9 rounded-full bg-red-50 hover:bg-red-500 text-red-500 hover:text-white border border-red-200 flex items-center justify-center shadow-sm transition-all hover:scale-105" title="Depoyu Sil"><Trash2 size={15} /></button>
                  </div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-12 h-12 ${wColor.iconBg} rounded-xl flex items-center justify-center border-2 border-white/50 ${wColor.text} shadow-inner overflow-hidden shrink-0`}>
                      {depo.listPhoto ? <img src={depo.listPhoto} alt={depo.name} className="w-full h-full object-cover" /> : <Home size={24} strokeWidth={1.5} />}
                    </div>
                    <h3 className={`text-xl font-black ${wColor.text} uppercase tracking-tight transition-colors`}>{depo.name}</h3>
                  </div>
                  {depo.address && <p className="text-[10px] text-gray-500 font-medium mb-1 line-clamp-1 flex items-center gap-1" title={depo.address}><MapPin size={10} /> {depo.address}</p>}
                  <p className="text-xs text-gray-500 font-semibold mb-6 flex items-center gap-1"><Box size={14}/> Ana Depo Merkezi</p>

                  <div className="mb-6 mt-auto">
                     <div className="flex justify-between text-xs font-bold text-slate-600 mb-2">
                        <span>{occupied} m³ Dolu</span>
                        <span className="text-gray-400">{capacity} m³ Kapasite</span>
                     </div>
                     <div className="h-2.5 w-full bg-white/60 rounded-full overflow-hidden shadow-inner border border-black/5">
                        <div className={`h-full ${wColor.bar} rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
                     </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                    <div className="bg-teal-50 rounded-lg p-2 flex flex-col items-center justify-center border border-teal-100" title="Boş Odalar">
                       <span className="text-lg font-black text-teal-600 leading-none">{stats.empty}</span>
                       <span className="text-[9px] font-bold mt-1 text-teal-600/70 uppercase">Boş</span>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 flex flex-col items-center justify-center border border-orange-100" title="Rezerve Odalar">
                       <span className="text-lg font-black text-orange-500 leading-none">{stats.reserved}</span>
                       <span className="text-[9px] font-bold mt-1 text-orange-500/70 uppercase">Rezerve</span>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2 flex flex-col items-center justify-center border border-red-100" title="Dolu Odalar">
                       <span className="text-lg font-black text-red-600 leading-none">{stats.full}</span>
                       <span className="text-[9px] font-bold mt-1 text-red-600/70 uppercase">Dolu</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => handleShareWarehouse(e, depo)} className="flex items-center gap-1.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-md shadow-green-500/30 transition-all hover:scale-105" title="WhatsApp'tan Paylaş (Adres + Konum)">
                       <MapPin size={14} /> Konum Paylaş
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEditWarehouseData({...depo}); setIsEditWarehouseModalOpen(true); }} className="flex items-center gap-1.5 bg-white hover:bg-[#1bc5bd] hover:text-white text-teal-600 border border-teal-200 px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition-all hover:scale-105" title="Düzenle">
                       <Edit size={14} /> Düzenle
                    </button>
                  </div>

                  <div className="mt-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setInspectionWarehouseId(depo.id); setInspectionTypeFilter('all'); setActiveMenu('sube-kontrol'); }}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-slate-800 to-slate-700 hover:from-indigo-600 hover:to-indigo-500 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all hover:scale-[1.02]"
                      title="Temizlik / İlaçlama / Genel Kontrol Kayıtları"
                    >
                      <Shield size={14} /> Kontrol
                      {(() => {
                          const cnt = (inspections || []).filter(i => String(i.warehouseId) === String(depo.id)).length;
                          return cnt > 0 ? <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{cnt}</span> : null;
                      })()}
                    </button>
                    {(() => {
                        const lastT = getLastInspection(depo.id, 'temizlik');
                        const lastI = getLastInspection(depo.id, 'ilaclama');
                        const isStale = (rec) => { if (!rec) return true; const d = (Date.now() - new Date(rec.date).getTime()) / 86400000; return d > 90; };
                        return (
                            <div className="flex items-center justify-between gap-2 mt-1.5 px-1">
                                <span className={`text-[9px] font-bold ${isStale(lastT) ? 'text-red-500' : 'text-slate-400'}`}>
                                    Temizlik: {lastT ? new Date(lastT.date).toLocaleDateString('tr-TR') : 'Kayıt yok'}
                                </span>
                                <span className={`text-[9px] font-bold ${isStale(lastI) ? 'text-red-500' : 'text-slate-400'}`}>
                                    İlaçlama: {lastI ? new Date(lastI.date).toLocaleDateString('tr-TR') : 'Kayıt yok'}
                                </span>
                            </div>
                        );
                    })()}
                  </div>
                </div>
              </div>
            )})}
            </div>
          </>
        ) : !selectedBlockId ? (
          <>
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div><button onClick={() => setSelectedWarehouseId(null)} className="text-xs font-bold text-gray-400 hover:text-[#1bc5bd] tracking-wider uppercase mb-1 flex items-center gap-1 transition-colors"><ArrowLeft size={14} /> {warehouses.find(w => w.id === selectedWarehouseId)?.name}</button><h2 className="text-2xl font-bold text-slate-800">Blok Listesi</h2></div>
              <div className="flex flex-nowrap items-center gap-2">
                  <button onClick={() => setSizeFilterModal({ scope: { warehouseId: selectedWarehouseId } })} className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all shadow-md shadow-purple-500/30 whitespace-nowrap">
                      <Search size={14} /> Oda Boyutu Bul
                  </button>
                  <button onClick={() => { setShowReservedView(true); setReservedViewScope({ warehouseId: selectedWarehouseId }); }} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors shadow-md shadow-orange-500/30 whitespace-nowrap">
                      <Clock size={14} /> Rezerve Göster
                  </button>
                  <button onClick={() => setIsAddBlockModalOpen(true)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors shadow-sm whitespace-nowrap">Blok Ekle <Plus size={14} /></button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-8">
            {(() => {
              // Bloklar, bağlı olduğu şubenin (deponun) rengini kullanır.
              // Şube rengi, deponun warehouses dizisindeki sırasına göre aynı paletten seçilir.
              const bColorPalette = [
                { side: 'bg-blue-500/80', title: 'text-blue-900', titleHover: 'group-hover:text-blue-600', icon: 'text-blue-400', barBg: 'bg-blue-50', bar: 'bg-blue-500', statText: 'text-blue-900/60', border: 'border-blue-100', editBg: 'bg-blue-50 hover:bg-blue-100 text-blue-600', divide: 'border-blue-50' },
                { side: 'bg-emerald-500/80', title: 'text-emerald-900', titleHover: 'group-hover:text-emerald-600', icon: 'text-emerald-400', barBg: 'bg-emerald-50', bar: 'bg-emerald-500', statText: 'text-emerald-900/60', border: 'border-emerald-100', editBg: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600', divide: 'border-emerald-50' },
                { side: 'bg-amber-500/80', title: 'text-amber-900', titleHover: 'group-hover:text-amber-600', icon: 'text-amber-400', barBg: 'bg-amber-50', bar: 'bg-amber-500', statText: 'text-amber-900/60', border: 'border-amber-100', editBg: 'bg-amber-50 hover:bg-amber-100 text-amber-600', divide: 'border-amber-50' },
                { side: 'bg-purple-500/80', title: 'text-purple-900', titleHover: 'group-hover:text-purple-600', icon: 'text-purple-400', barBg: 'bg-purple-50', bar: 'bg-purple-500', statText: 'text-purple-900/60', border: 'border-purple-100', editBg: 'bg-purple-50 hover:bg-purple-100 text-purple-600', divide: 'border-purple-50' },
                { side: 'bg-rose-500/80', title: 'text-rose-900', titleHover: 'group-hover:text-rose-600', icon: 'text-rose-400', barBg: 'bg-rose-50', bar: 'bg-rose-500', statText: 'text-rose-900/60', border: 'border-rose-100', editBg: 'bg-rose-50 hover:bg-rose-100 text-rose-600', divide: 'border-rose-50' },
                { side: 'bg-cyan-500/80', title: 'text-cyan-900', titleHover: 'group-hover:text-cyan-600', icon: 'text-cyan-400', barBg: 'bg-cyan-50', bar: 'bg-cyan-500', statText: 'text-cyan-900/60', border: 'border-cyan-100', editBg: 'bg-cyan-50 hover:bg-cyan-100 text-cyan-600', divide: 'border-cyan-50' },
                { side: 'bg-fuchsia-500/80', title: 'text-fuchsia-900', titleHover: 'group-hover:text-fuchsia-600', icon: 'text-fuchsia-400', barBg: 'bg-fuchsia-50', bar: 'bg-fuchsia-500', statText: 'text-fuchsia-900/60', border: 'border-fuchsia-100', editBg: 'bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-600', divide: 'border-fuchsia-50' },
                { side: 'bg-teal-500/80', title: 'text-teal-900', titleHover: 'group-hover:text-teal-600', icon: 'text-teal-400', barBg: 'bg-teal-50', bar: 'bg-teal-500', statText: 'text-teal-900/60', border: 'border-teal-100', editBg: 'bg-teal-50 hover:bg-teal-100 text-teal-600', divide: 'border-teal-50' },
              ];
              const whIndex = warehouses.findIndex(w => w.id === selectedWarehouseId);
              const bColor = bColorPalette[(whIndex < 0 ? 0 : whIndex) % 8];
              return blocks.filter(b => b.warehouseId === selectedWarehouseId).map((blok, index, arr) => {
              const stats = getRoomStats(blok.id);
              const occupied = getBlockOccupiedM3(blok.id);
              const capacity = getBlockCapacityM3(blok.id);
              const percentage = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;

              return (
              <div key={blok.id} onClick={() => setSelectedBlockId(blok.id)} className={`bg-white rounded-xl shadow-sm hover:shadow-lg border-2 ${bColor.border} relative transition-all duration-300 cursor-pointer group flex flex-col min-h-[220px] overflow-hidden`}>
                <div className={`absolute left-0 top-0 bottom-0 w-2.5 ${bColor.side}`}></div>
                <div className={`absolute right-0 top-0 bottom-0 w-2.5 ${bColor.side}`}></div>

                <div className="p-5 px-7 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-3 z-10" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setEntityPhotoViewer({ type: 'block', id: blok.id }); }} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center shadow-md ring-2 ring-white/70 transition-all hover:scale-105" title="Blok Fotoğrafı"><Eye size={14} /></button>
                    <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-full px-1.5 py-1 shadow-sm" title="Sırayı Değiştir">
                      <button onClick={(e) => moveBlockUp(index, arr, e)} disabled={index === 0} className="hover:bg-gray-200 text-gray-500 p-1 rounded-full transition-colors disabled:opacity-30"><ArrowUp size={12} /></button>
                      <button onClick={(e) => moveBlockDown(index, arr, e)} disabled={index === arr.length - 1} className="hover:bg-gray-200 text-gray-500 p-1 rounded-full transition-colors disabled:opacity-30"><ArrowDown size={12} /></button>
                    </div>
                    <button onClick={(e) => handleDeleteBlockClick(e, blok.id)} className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-500 text-red-500 hover:text-white border border-red-200 flex items-center justify-center shadow-sm transition-all hover:scale-105" title="Sil"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className={`text-2xl font-black ${bColor.title} uppercase tracking-tight flex items-center gap-2 ${bColor.titleHover} transition-colors`}>
                       {blok.listPhoto ? <img src={blok.listPhoto} alt={blok.name} className="w-8 h-8 rounded-lg object-cover border border-white shadow-sm" /> : <LayoutDashboard size={24} className={bColor.icon} />} {blok.name}
                    </h3>
                  </div>

                  <div className="mb-6 mt-auto">
                     <div className={`flex justify-between text-xs font-bold ${bColor.statText} mb-2`}>
                        <span>{occupied} m³ / {capacity} m³</span>
                        <span>{percentage}% Dolu</span>
                     </div>
                     <div className={`h-2.5 w-full ${bColor.barBg} rounded-full overflow-hidden shadow-inner`}>
                        <div className={`h-full ${bColor.bar} rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
                     </div>
                  </div>

                  <div className={`flex justify-between items-center border-t ${bColor.divide} pt-4`}>
                    <div className="flex items-center gap-1.5 text-teal-600 bg-teal-50 px-2 py-1 rounded" title="Boş Odalar"><Home size={14} strokeWidth={2.5}/> <span className="font-bold text-sm">{stats.empty}</span></div>
                    <div className="flex items-center gap-1.5 text-orange-500 bg-orange-50 px-2 py-1 rounded" title="Rezerve Odalar"><Clock size={14} strokeWidth={2.5}/> <span className="font-bold text-sm">{stats.reserved}</span></div>
                    <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded" title="Dolu Odalar"><Key size={14} strokeWidth={2.5}/> <span className="font-bold text-sm">{stats.full}</span></div>
                  </div>

                  <div className="flex justify-end mt-3" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setEditBlockData({...blok}); setIsEditBlockModalOpen(true); }} className={`${bColor.editBg} flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all hover:scale-105`} title="Düzenle"><Edit size={13} /> Düzenle</button>
                  </div>
                </div>
              </div>
            )});
            })()}
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div><button onClick={() => setSelectedBlockId(null)} className="text-xs font-bold text-gray-400 hover:text-[#1bc5bd] tracking-wider uppercase mb-1 flex items-center gap-1 transition-colors"><ArrowLeft size={14} /> {blocks.find(b => b.id === selectedBlockId)?.name}</button><h2 className="text-2xl font-bold text-slate-800">Oda Listesi</h2></div>
              <div className="flex flex-nowrap items-center gap-2">
                  <button onClick={() => setSizeFilterModal({ scope: { blockId: selectedBlockId } })} className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all shadow-md shadow-purple-500/30 whitespace-nowrap">
                      <Search size={14} /> Oda Boyutu Bul
                  </button>
                  <button onClick={() => { setShowReservedView(true); setReservedViewScope({ blockId: selectedBlockId }); }} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors shadow-md shadow-orange-500/30 whitespace-nowrap">
                      <Clock size={14} /> Rezerve Göster
                  </button>
                  <button onClick={() => setIsAddRoomModalOpen(true)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors shadow-sm whitespace-nowrap">Oda Ekle <Plus size={14} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-6 pb-8">
              {rooms.filter(r => r.blockId === selectedBlockId).map((oda, index, arr) => {
                let headerBg = 'bg-[#1bc5bd]'; let badgeStyle = 'bg-white text-teal-600 border-teal-200'; let statusText = 'BOŞ ODA';
                let isValidReservation = oda.isReserved && (!oda.reserveExpiryTimestamp || oda.reserveExpiryTimestamp > Date.now());

                if (oda.customerName) { headerBg = 'bg-[#c81e3a]'; badgeStyle = 'bg-red-50 text-red-600 border-red-200'; statusText = oda.customerName; }
                else if (isValidReservation) { headerBg = 'bg-orange-500'; badgeStyle = 'bg-orange-50 text-orange-600 border-orange-200'; statusText = `REZERVELİ`; }

                const currentBlock = blocks.find(b => b.id === oda.blockId);
                const currentWarehouse = warehouses.find(w => w.id === currentBlock?.warehouseId);

                return (
                <div key={oda.id} onClick={() => setSelectedRoomId(oda.id)} className="relative rounded-xl overflow-hidden shadow-sm group hover:shadow-xl transition-all transform hover:-translate-y-1 cursor-pointer bg-white border border-gray-300 flex flex-col">

                  <div className={`px-3 sm:px-4 py-2.5 flex items-center ${headerBg} text-white shadow-md z-10`}>
                      <div className="flex flex-col min-w-0 w-full gap-1">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                              <h3 className="font-black text-lg sm:text-xl tracking-wide leading-none drop-shadow-sm truncate min-w-0">{oda.name}</h3>
                              <span className="text-[10px] font-bold bg-black/25 px-2 py-1 rounded shadow-inner shrink-0 whitespace-nowrap">{displayRoomM3(oda)} m³</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className="text-[9px] opacity-90 font-medium truncate min-w-0" title={`${currentWarehouse?.name} - ${currentBlock?.name}`}>{currentWarehouse?.name} - {currentBlock?.name}</span>
                              {formatRoomDims(oda) && <span className="text-[9px] font-bold bg-black/15 px-1.5 py-0.5 rounded shadow-inner shrink-0 whitespace-nowrap" title="En × Boy × Yükseklik">{formatRoomDims(oda)}</span>}
                          </div>
                      </div>
                  </div>

                  <div className="flex-1 relative flex flex-col justify-center items-center min-h-[185px]"
                       style={ oda.roomListPhoto ? { backgroundImage: `url(${oda.roomListPhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundImage: 'repeating-linear-gradient(to bottom, #f8fafc, #f8fafc 12px, #e2e8f0 12px, #e2e8f0 14px)' }}>

                       {oda.roomListPhoto && <div className="absolute inset-0 bg-black/25"></div>}

                       {oda.isUnderLegalAction && (
                          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                             <span className="border-4 border-red-600 text-red-600 bg-white/85 font-black text-sm sm:text-base tracking-[0.2em] uppercase px-4 py-1.5 rounded-lg shadow-lg" style={{ transform: 'rotate(-14deg)', letterSpacing: '0.18em' }}>
                                İCRA SÜRECİNDE
                             </span>
                          </div>
                       )}

                       <button onClick={(e) => { e.stopPropagation(); setRoomPhotoViewer(oda.id); }} className="absolute top-1.5 left-1.5 z-20 bg-white/90 hover:bg-white text-slate-700 p-1.5 rounded-lg shadow transition-colors" title="Oda Fotoğrafı">
                          <Eye size={17} />
                       </button>

                       <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center z-10">
                          {oda.customerName ? (
                              <div className="bg-gradient-to-b from-amber-300 to-amber-500 border border-amber-600 rounded-md p-1.5 shadow-md text-amber-900" title="Dolu - Kilitli">
                                  <Lock size={18} strokeWidth={2.5} />
                              </div>
                          ) : (
                              <div className="w-10 h-3 bg-slate-300 border border-slate-400 rounded-sm flex items-center justify-center shadow-sm">
                                 <div className="w-3 h-1 bg-slate-500 rounded-full"></div>
                              </div>
                          )}
                       </div>

                       <div className={`relative z-10 px-4 py-2.5 rounded-xl border-2 shadow-md font-bold uppercase text-xs text-center max-w-[85%] truncate ${badgeStyle}`}>
                           {statusText}
                       </div>

                       <div className="absolute top-1.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-20 bg-white/90 rounded-full px-1 py-0.5 shadow" onClick={e => e.stopPropagation()} title="Sırayı Değiştir">
                          <button onClick={(e) => moveRoomUp(index, arr, e)} disabled={index === 0} className="hover:bg-gray-100 text-gray-500 p-0.5 rounded-full transition-colors disabled:opacity-30"><ArrowUp size={10} /></button>
                          <button onClick={(e) => moveRoomDown(index, arr, e)} disabled={index === arr.length - 1} className="hover:bg-gray-100 text-gray-500 p-0.5 rounded-full transition-colors disabled:opacity-30"><ArrowDown size={10} /></button>
                       </div>
                       <button onClick={(e) => handleDeleteRoomClick(e, oda.id)} className="absolute top-1.5 right-1.5 z-20 bg-white/90 hover:bg-red-500 hover:text-white text-red-600 p-1 rounded-md shadow transition-colors" title="Sil"><Trash2 size={12} /></button>
                       <button onClick={(e) => { e.stopPropagation(); setEditRoomData({...oda}); setIsEditRoomModalOpen(true); }} className="absolute bottom-1.5 right-1.5 z-20 bg-white/90 hover:bg-gray-100 text-gray-700 p-1 rounded-md shadow transition-colors" title="Düzenle"><Edit size={12} /></button>
                  </div>
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* DEPO EKLE MODALI */}
      {isAddWarehouseModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-medium w-full text-center">Yeni Depo Ekle</h3><button onClick={()=>setIsAddWarehouseModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
             <div className="p-6">
                <input type="text" value={newDepoName} onChange={(e)=>setNewDepoName(e.target.value.toUpperCase())} placeholder="Depo Adı" className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-cyan-500" />
                <input type="text" value={newDepoAddress} onChange={(e)=>setNewDepoAddress(e.target.value)} placeholder="Depo Adresi" className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-cyan-500" />
                <input type="text" value={newDepoMapLink} onChange={(e)=>setNewDepoMapLink(e.target.value)} placeholder="Google Harita Linki (örn: https://maps.app.goo.gl/...)" className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-cyan-500" />
                <input type="number" value={newDepoM3} onChange={(e)=>setNewDepoM3(e.target.value)} placeholder="Toplam Hacim (m³)" className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-cyan-500" />
                <button onClick={handleAddWarehouse} className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors">Kaydet</button>
             </div>
          </div>
        </div>
      )}

      {/* DEPO DÜZENLE MODALI */}
      {isEditWarehouseModalOpen && editWarehouseData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-medium w-full text-center">Depoyu Düzenle</h3><button onClick={()=>setIsEditWarehouseModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
             <div className="p-6">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Depo Adı</label><input type="text" value={editWarehouseData.name} onChange={(e)=>setEditWarehouseData({...editWarehouseData, name: e.target.value.toUpperCase()})} placeholder="Depo Adı" className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:border-cyan-500" />
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Depo Adresi</label><input type="text" value={editWarehouseData.address || ''} onChange={(e)=>setEditWarehouseData({...editWarehouseData, address: e.target.value})} placeholder="Depo Adresi" className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:border-cyan-500" />
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Google Harita Linki</label><input type="text" value={editWarehouseData.mapLink || ''} onChange={(e)=>setEditWarehouseData({...editWarehouseData, mapLink: e.target.value})} placeholder="https://maps.app.goo.gl/..." className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:border-cyan-500" />
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Toplam Hacim (m³)</label><input type="number" value={editWarehouseData.m3} onChange={(e)=>setEditWarehouseData({...editWarehouseData, m3: e.target.value})} placeholder="Toplam Hacim (m³)" className="w-full border border-gray-300 rounded px-3 py-2 mb-6 focus:outline-none focus:border-cyan-500" />
                <button onClick={handleEditWarehouse} className="w-full bg-[#1bc5bd] hover:bg-teal-500 text-white px-4 py-2 rounded transition-colors font-medium">Değişiklikleri Kaydet</button>
             </div>
          </div>
        </div>
      )}

      {/* BLOK EKLE MODALI */}
      {isAddBlockModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-medium w-full text-center">Yeni Blok Ekle</h3><button onClick={()=>setIsAddBlockModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
             <div className="p-6">
                <input type="text" value={newBlockName} onChange={(e)=>setNewBlockName(e.target.value.toUpperCase())} placeholder="Blok Adı" className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-cyan-500" />
                <input type="number" value={newBlockM3} onChange={(e)=>setNewBlockM3(e.target.value)} placeholder="Toplam Hacim (m³)" className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-cyan-500" />
                <button onClick={handleAddBlock} className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors">Kaydet</button>
             </div>
          </div>
        </div>
      )}

      {/* ODA EKLE MODALI */}
      {isAddRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-medium w-full text-center">Yeni Oda Ekle</h3><button onClick={()=>setIsAddRoomModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
             <div className="p-6">
                <input type="text" value={newRoomName} onChange={(e)=>setNewRoomName(e.target.value.toUpperCase())} placeholder="Oda Adı" className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:border-cyan-500" />

                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">Oda Ölçüleri (metre)</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                   <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-cyan-500 pointer-events-none"><MoveHorizontal size={15}/></span>
                      <input type="number" step="0.01" value={newRoomDims.width} onChange={(e)=>setNewRoomDims(d=>({...d, width:e.target.value}))} placeholder="En" className="w-full border border-gray-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-cyan-500" />
                   </div>
                   <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none"><MoveDiagonal size={15}/></span>
                      <input type="number" step="0.01" value={newRoomDims.length} onChange={(e)=>setNewRoomDims(d=>({...d, length:e.target.value}))} placeholder="Boy" className="w-full border border-gray-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                   </div>
                   <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none"><MoveVertical size={15}/></span>
                      <input type="number" step="0.01" value={newRoomDims.height} onChange={(e)=>setNewRoomDims(d=>({...d, height:e.target.value}))} placeholder="Yük." className="w-full border border-gray-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-orange-500" />
                   </div>
                </div>

                <button
                   onClick={() => { const v = !newRoomHasColumn; setNewRoomHasColumn(v); if (!v) setNewRoomCol({ width:'', length:'', height:'' }); }}
                   className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold mb-3 border-2 transition-all ${newRoomHasColumn ? 'bg-amber-500 border-amber-500 text-white shadow-md' : 'bg-white border-dashed border-amber-300 text-amber-600 hover:bg-amber-50'}`}
                >
                   <Columns size={15}/> {newRoomHasColumn ? 'Kolon Var (ölçüleri girin)' : 'Kolon Var mı? — Ekle'}
                </button>

                {newRoomHasColumn && (
                   <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 mb-3">
                      <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2 block">Kolon Ölçüleri (metre)</label>
                      <div className="grid grid-cols-3 gap-2">
                         <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none"><MoveHorizontal size={14}/></span>
                            <input type="number" step="0.01" value={newRoomCol.width} onChange={(e)=>setNewRoomCol(d=>({...d, width:e.target.value}))} placeholder="En" className="w-full border border-amber-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white" />
                         </div>
                         <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none"><MoveDiagonal size={14}/></span>
                            <input type="number" step="0.01" value={newRoomCol.length} onChange={(e)=>setNewRoomCol(d=>({...d, length:e.target.value}))} placeholder="Boy" className="w-full border border-amber-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white" />
                         </div>
                         <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none"><MoveVertical size={14}/></span>
                            <input type="number" step="0.01" value={newRoomCol.height} onChange={(e)=>setNewRoomCol(d=>({...d, height:e.target.value}))} placeholder="Yük." className="w-full border border-amber-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white" />
                         </div>
                      </div>
                      <p className="text-[10px] text-amber-600 font-semibold mt-2">Kolon hacmi odanın toplam m³'ünden düşülür.</p>
                   </div>
                )}

                {(() => {
                    const gross = calcVolume(newRoomDims.width, newRoomDims.length, newRoomDims.height);
                    if (gross == null) return null;
                    const col = newRoomHasColumn ? calcVolume(newRoomCol.width, newRoomCol.length, newRoomCol.height) : null;
                    const net = Math.max(0, Math.round((gross - (col || 0)) * 100) / 100);
                    const fmt = (v) => String(v).replace('.', ',');
                    return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 mb-3">
                            {col != null && (
                               <>
                                 <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                                    <span>Brüt Hacim</span><span>{fmt(gross)} m³</span>
                                 </div>
                                 <div className="flex items-center justify-between text-[11px] font-bold text-amber-600 mb-1.5 pb-1.5 border-b border-emerald-200">
                                    <span className="flex items-center gap-1"><Columns size={12}/> Kolon Düşümü</span><span>− {fmt(col)} m³</span>
                                 </div>
                               </>
                            )}
                            <div className="flex items-center justify-between">
                               <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5"><Box size={14}/> {col != null ? 'Net Kullanılabilir Hacim' : 'Otomatik Hesaplanan Hacim'}</span>
                               <span className="text-right">
                                  <span className="block text-base font-black text-emerald-700 leading-none">{roundRoomM3(net)} m³</span>
                                  {roundRoomM3(net) !== net && <span className="block text-[9px] text-emerald-600/70 font-bold mt-0.5">ham: {fmt(net)} m³</span>}
                               </span>
                            </div>
                        </div>
                    );
                })()}

                <input type="number" value={newRoomM3} onChange={(e)=>setNewRoomM3(e.target.value)} placeholder="Hacim (m³) — ölçü girilmezse elle yazın" className="w-full border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:border-cyan-500 text-sm" />
                <button onClick={handleAddRoom} className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors">Kaydet</button>
             </div>
          </div>
        </div>
      )}

      {/* BLOK DÜZENLE MODALI */}
      {isEditBlockModalOpen && editBlockData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-medium w-full text-center">Bloku Düzenle</h3><button onClick={()=>setIsEditBlockModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
             <div className="p-6">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Blok Adı</label><input type="text" value={editBlockData.name} onChange={(e)=>setEditBlockData({...editBlockData, name: e.target.value.toUpperCase()})} placeholder="Blok Adı" className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:border-cyan-500" />
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Toplam Hacim (m³)</label><input type="number" value={editBlockData.m3} onChange={(e)=>setEditBlockData({...editBlockData, m3: e.target.value})} placeholder="Toplam Hacim (m³)" className="w-full border border-gray-300 rounded px-3 py-2 mb-6 focus:outline-none focus:border-cyan-500" />
                <button onClick={handleEditBlock} className="w-full bg-[#1bc5bd] hover:bg-teal-500 text-white px-4 py-2 rounded transition-colors font-medium">Değişiklikleri Kaydet</button>
             </div>
          </div>
        </div>
      )}

      {/* ODA DÜZENLE MODALI */}
      {isEditRoomModalOpen && editRoomData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center"><h3 className="text-lg font-medium w-full text-center">Oda Özelliklerini Düzenle</h3><button onClick={()=>setIsEditRoomModalOpen(false)}><X size={20} className="text-gray-400"/></button></div>
             <div className="p-6">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Oda Adı</label><input type="text" value={editRoomData.name} onChange={(e)=>setEditRoomData({...editRoomData, name: e.target.value.toUpperCase()})} placeholder="Oda Adı" className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:border-cyan-500" />

                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Oda Ölçüleri (metre)</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                   <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-cyan-500 pointer-events-none"><MoveHorizontal size={15}/></span>
                      <input type="number" step="0.01" value={editRoomData.width ?? ''} onChange={(e)=>setEditRoomData({...editRoomData, width: e.target.value})} placeholder="En" className="w-full border border-gray-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-cyan-500" />
                   </div>
                   <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none"><MoveDiagonal size={15}/></span>
                      <input type="number" step="0.01" value={editRoomData.length ?? ''} onChange={(e)=>setEditRoomData({...editRoomData, length: e.target.value})} placeholder="Boy" className="w-full border border-gray-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                   </div>
                   <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none"><MoveVertical size={15}/></span>
                      <input type="number" step="0.01" value={editRoomData.height ?? ''} onChange={(e)=>setEditRoomData({...editRoomData, height: e.target.value})} placeholder="Yük." className="w-full border border-gray-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-orange-500" />
                   </div>
                </div>

                <button
                   onClick={() => setEditRoomData(d => ({ ...d, hasColumn: !d.hasColumn, ...(d.hasColumn ? { columnWidth:'', columnLength:'', columnHeight:'' } : {}) }))}
                   className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold mb-3 border-2 transition-all ${editRoomData.hasColumn ? 'bg-amber-500 border-amber-500 text-white shadow-md' : 'bg-white border-dashed border-amber-300 text-amber-600 hover:bg-amber-50'}`}
                >
                   <Columns size={15}/> {editRoomData.hasColumn ? 'Kolon Var (ölçüleri girin)' : 'Kolon Var mı? — Ekle'}
                </button>
                {editRoomData.hasColumn && (
                   <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 mb-3">
                      <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2 block">Kolon Ölçüleri (metre)</label>
                      <div className="grid grid-cols-3 gap-2">
                         <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none"><MoveHorizontal size={14}/></span>
                            <input type="number" step="0.01" value={editRoomData.columnWidth ?? ''} onChange={(e)=>setEditRoomData({...editRoomData, columnWidth: e.target.value})} placeholder="En" className="w-full border border-amber-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white" />
                         </div>
                         <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none"><MoveDiagonal size={14}/></span>
                            <input type="number" step="0.01" value={editRoomData.columnLength ?? ''} onChange={(e)=>setEditRoomData({...editRoomData, columnLength: e.target.value})} placeholder="Boy" className="w-full border border-amber-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white" />
                         </div>
                         <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none"><MoveVertical size={14}/></span>
                            <input type="number" step="0.01" value={editRoomData.columnHeight ?? ''} onChange={(e)=>setEditRoomData({...editRoomData, columnHeight: e.target.value})} placeholder="Yük." className="w-full border border-amber-300 rounded pl-7 pr-2 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white" />
                         </div>
                      </div>
                   </div>
                )}

                {(() => {
                    const gross = calcVolume(editRoomData.width, editRoomData.length, editRoomData.height);
                    if (gross == null) return null;
                    const col = editRoomData.hasColumn ? calcVolume(editRoomData.columnWidth, editRoomData.columnLength, editRoomData.columnHeight) : null;
                    const net = Math.max(0, Math.round((gross - (col || 0)) * 100) / 100);
                    const fmt = (v) => String(v).replace('.', ',');
                    return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 mb-3">
                            {col != null && (
                               <>
                                 <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1"><span>Brüt Hacim</span><span>{fmt(gross)} m³</span></div>
                                 <div className="flex items-center justify-between text-[11px] font-bold text-amber-600 mb-1.5 pb-1.5 border-b border-emerald-200"><span className="flex items-center gap-1"><Columns size={12}/> Kolon Düşümü</span><span>− {fmt(col)} m³</span></div>
                               </>
                            )}
                            <div className="flex items-center justify-between">
                               <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5"><Box size={14}/> {col != null ? 'Net Kullanılabilir Hacim' : 'Otomatik Hesaplanan Hacim'}</span>
                               <span className="text-right">
                                  <span className="block text-base font-black text-emerald-700 leading-none">{roundRoomM3(net)} m³</span>
                                  {roundRoomM3(net) !== net && <span className="block text-[9px] text-emerald-600/70 font-bold mt-0.5">ham: {fmt(net)} m³</span>}
                               </span>
                            </div>
                        </div>
                    );
                })()}

                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Hacim (m³)</label><input type="number" value={editRoomData.m3} onChange={(e)=>setEditRoomData({...editRoomData, m3: e.target.value})} placeholder="Hacim (m³)" className="w-full border border-gray-300 rounded px-3 py-2 mb-6 focus:outline-none focus:border-cyan-500" />
                <button onClick={handleEditRoom} className="w-full bg-[#1bc5bd] hover:bg-teal-500 text-white px-4 py-2 rounded transition-colors font-medium">Değişiklikleri Kaydet</button>
             </div>
          </div>
        </div>
      )}

      {/* DEPO/BLOK FOTOĞRAF GÖRÜNTÜLEYİCİ */}
      {entityPhotoViewer !== null && (() => {
          const isWh = entityPhotoViewer.type === 'warehouse';
          const ent = isWh ? warehouses.find(w => w.id === entityPhotoViewer.id) : blocks.find(b => b.id === entityPhotoViewer.id);
          if (!ent) return null;
          const label = isWh ? 'Depo' : 'Blok';
          return (
            <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4" onClick={() => setEntityPhotoViewer(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in" onClick={(e) => e.stopPropagation()}>
                 <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Eye size={18} className="text-[#1bc5bd]"/> {ent.name} — {label} Fotoğrafı</h3>
                    <button onClick={() => setEntityPhotoViewer(null)} className="text-gray-400 hover:text-red-500 bg-white p-1 rounded-full shadow-sm"><X size={20}/></button>
                 </div>
                 <div className="p-5">
                    {ent.listPhoto ? (
                       <div className="flex flex-col gap-4">
                          <a href={ent.listPhoto} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                             <img src={ent.listPhoto} alt={`${ent.name} fotoğrafı`} className="w-full max-h-80 object-contain bg-gray-50" />
                          </a>
                          <div className="flex gap-2">
                             <label className="flex-1 bg-[#1bc5bd] hover:bg-teal-500 text-white rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                                <RefreshCcw size={15}/> Değiştir
                                <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files[0]; if(f) await handleSetEntityPhoto(entityPhotoViewer.type, entityPhotoViewer.id, f); e.target.value=''; }}/>
                             </label>
                             <button onClick={async () => { await handleRemoveEntityPhoto(entityPhotoViewer.type, entityPhotoViewer.id); }} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors border border-red-100">
                                <Trash2 size={15}/> Sil
                             </button>
                          </div>
                       </div>
                    ) : (
                       <div className="flex flex-col items-center gap-4 py-4">
                          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">{isWh ? <Home size={28} className="text-gray-300"/> : <LayoutDashboard size={28} className="text-gray-300"/>}</div>
                          <p className="text-sm text-gray-500 font-medium text-center">Bu {label.toLowerCase()} için henüz bir fotoğraf eklenmemiş.</p>
                          <label className="w-full bg-[#1bc5bd] hover:bg-teal-500 text-white rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm">
                             <Upload size={16}/> {label} Fotoğrafı Ekle
                             <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files[0]; if(f) await handleSetEntityPhoto(entityPhotoViewer.type, entityPhotoViewer.id, f); e.target.value=''; }}/>
                          </label>
                       </div>
                    )}
                 </div>
              </div>
            </div>
          );
      })()}

      {/* ODA BOYUTU BUL — seçenekler ekranın ORTASINDA modal pencerede.
          Seçim yapılınca kapsam (tümü/şube/blok) uygulanır ve boş odalar listelenir. */}
      {sizeFilterModal && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={() => setSizeFilterModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in" onClick={(e) => e.stopPropagation()}>
             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-purple-50 rounded-t-2xl">
                 <div>
                    <h3 className="text-lg font-bold text-purple-700 flex items-center gap-2"><Search size={18} /> Oda Boyutu Bul</h3>
                    <p className="text-[11px] text-purple-500 font-semibold mt-0.5">
                       {sizeFilterModal.scope?.blockId ? `${blocks.find(b => b.id === sizeFilterModal.scope.blockId)?.name} içindeki boş odalar` :
                        sizeFilterModal.scope?.warehouseId ? `${warehouses.find(w => w.id === sizeFilterModal.scope.warehouseId)?.name} içindeki boş odalar` :
                        'Tüm depolardaki boş odalar'}
                    </p>
                 </div>
                 <button onClick={() => setSizeFilterModal(null)} className="text-purple-400 hover:text-purple-600 bg-white p-1 rounded-full shadow-sm"><X size={20} /></button>
             </div>
             <div className="p-4 flex flex-col gap-2">
                {sizeFilters.map(f => (
                    <button key={f.id} onClick={() => { setActiveSizeFilter(f.id); setSizeFilterScope(sizeFilterModal.scope || null); setSizeFilterModal(null); }} className="w-full text-left px-4 py-3.5 rounded-xl text-sm font-bold text-gray-700 bg-gray-50 hover:bg-purple-50 hover:text-purple-700 border border-gray-100 hover:border-purple-200 transition-colors flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-500 group-hover:bg-purple-500 group-hover:text-white flex items-center justify-center shrink-0 transition-colors"><Box size={18} /></div>
                        {f.label}
                    </button>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* ŞUBE SİL ONAY MODALI */}
      {isDeleteWarehouseModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                 <h3 className="text-xl font-bold text-red-600 mx-auto w-full text-center">Şubeyi Sil</h3>
                 <button onClick={() => setIsDeleteWarehouseModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-red-500"><X size={20} /></button>
             </div>
             <div className="p-6 text-center">
                <div className="mx-auto bg-red-50 text-red-500 w-16 h-16 flex items-center justify-center rounded-full mb-4"><AlertCircle size={32} /></div>
                <p className="text-gray-700 font-bold mb-2">Bu şubeyi silmek istediğinizden emin misiniz?</p>
                <p className="text-gray-500 text-sm mb-6">Bu işlem geri alınamaz ve içerisindeki yapılar kaybolabilir!</p>
                <div className="flex justify-center gap-3">
                    <button onClick={() => setIsDeleteWarehouseModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2.5 rounded-lg font-bold transition-colors text-sm w-1/2">Hayır</button>
                    <button onClick={confirmDeleteWarehouse} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm w-1/2 shadow-lg shadow-red-500/30"><Trash2 size={16} /> Evet, Sil</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* BLOK SİL ONAY MODALI */}
      {isDeleteBlockModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                 <h3 className="text-xl font-bold text-red-600 mx-auto w-full text-center">Bloku Sil</h3>
                 <button onClick={() => setIsDeleteBlockModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-red-500"><X size={20} /></button>
             </div>
             <div className="p-6 text-center">
                <div className="mx-auto bg-red-50 text-red-500 w-16 h-16 flex items-center justify-center rounded-full mb-4"><AlertCircle size={32} /></div>
                <p className="text-gray-700 font-bold mb-2">Bu bloku silmek istediğinizden emin misiniz?</p>
                <p className="text-gray-500 text-sm mb-6">Bu işlem kalıcıdır ve içerisindeki odalarla bağ kopabilir!</p>
                <div className="flex justify-center gap-3">
                    <button onClick={() => setIsDeleteBlockModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2.5 rounded-lg font-bold transition-colors text-sm w-1/2">Hayır</button>
                    <button onClick={confirmDeleteBlock} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm w-1/2 shadow-lg shadow-red-500/30"><Trash2 size={16} /> Evet, Sil</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* ODA SİL ONAY MODALI */}
      {isDeleteRoomModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in">
             <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                 <h3 className="text-xl font-bold text-red-600 mx-auto w-full text-center">Odayı Sil</h3>
                 <button onClick={() => setIsDeleteRoomModalOpen(false)} className="absolute right-5 text-gray-400 hover:text-red-500"><X size={20} /></button>
             </div>
             <div className="p-6 text-center">
                <div className="mx-auto bg-red-50 text-red-500 w-16 h-16 flex items-center justify-center rounded-full mb-4"><AlertCircle size={32} /></div>
                <p className="text-gray-700 font-bold mb-2">Bu odayı silmek istediğinizden emin misiniz?</p>
                <p className="text-gray-500 text-sm mb-6">Bu işlem kalıcıdır ve geri alınamaz!</p>
                <div className="flex justify-center gap-3">
                    <button onClick={() => setIsDeleteRoomModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2.5 rounded-lg font-bold transition-colors text-sm w-1/2">Hayır</button>
                    <button onClick={confirmDeleteRoom} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm w-1/2 shadow-lg shadow-red-500/30"><Trash2 size={16} /> Evet, Sil</button>
                </div>
             </div>
          </div>
        </div>
      )}
    </>
  );
}
