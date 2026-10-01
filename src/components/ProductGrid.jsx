import React, { useState, useEffect } from 'react';
import { db, storage, collection, onSnapshot, doc, deleteDoc, updateDoc, setDoc, auth, signInWithEmailAndPassword, ref, uploadBytes, getDownloadURL, functions, httpsCallable } from '../firebase';
import { toast } from '../utils/toast';
import LottieAnimation from './LottieAnimation';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:10000';

async function ensureAdminAuth() {
  if (!auth.currentUser) {
    const configuredAdmin = (import.meta.env.VITE_ADMIN_EMAIL || 'achudharaa@gmail.com').trim();
    const customPass = import.meta.env.VITE_ADMIN_PASSWORD || 'SriSuryaTex@2026';
    try {
      await signInWithEmailAndPassword(auth, configuredAdmin, customPass);
    } catch (_) {}
  }
}

export default function ProductGrid({ products }) {
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [firestoreCategories, setFirestoreCategories] = useState([]);

  // Subscribe to real-time categories from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats = snapshot.docs.map((d) => d.data().name).filter(Boolean);
      if (cats.length > 0) {
        setFirestoreCategories(cats);
      }
    }, (err) => {
      console.warn('Firestore categories sync notice:', err.message);
    });

    return () => unsubscribe();
  }, []);
  const [sortOption, setSortOption] = useState('default');
  const [activeCardImages, setActiveCardImages] = useState({});
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    category: 'Handloom Mats',
    baseRate: '',
    unit: 'per Bundle',
    bundlePieces: 10,
    bundlesPerPack: 8,
    stockStatus: 'IN_STOCK',
    stockQty: 100,
    seasonNotice: 'Price may differ based on the season item or the stock quantity',
    minOrderNotice: '',
    description: '',
    existingImages: [],
    newImageFiles: [],
    newImagePreviews: [],
    isDisabled: false
  });
  const [updating, setUpdating] = useState(false);

  // Open Edit Modal with Multi-Image & Disabled State
  const handleStartEdit = (prod) => {
    const isCurrentlyInStock = prod.inStock !== false && prod.stockStatus !== 'OUT_OF_STOCK';
    const prodImages = Array.isArray(prod.images) && prod.images.length > 0 
      ? prod.images 
      : (prod.imageUrl ? [prod.imageUrl] : ['/assets/logo.jpg']);
    setEditingProduct(prod);
    setEditForm({
      title: prod.title || '',
      category: prod.category || 'Handloom Mats',
      baseRate: prod.baseRate || '',
      unit: prod.unit || 'per Bundle',
      bundlePieces: prod.bundlePieces || 10,
      bundlesPerPack: prod.bundlesPerPack || (prod.unit === 'per Piece' ? 120 : 8),
      stockStatus: isCurrentlyInStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
      stockQty: isCurrentlyInStock ? 100 : 0,
      seasonNotice: prod.seasonNotice || 'Price may differ based on the season item or the stock quantity',
      minOrderNotice: prod.minOrderNotice || '',
      description: prod.description || '',
      existingImages: prodImages,
      newImageFiles: [],
      newImagePreviews: [],
      isDisabled: !!prod.isDisabled
    });
  };

  // Helper for image compression
  const compressImage = (file, maxWidth = 800, quality = 0.75) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (cErr) {
            resolve(e.target.result);
          }
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Handle New Image Selection inside Edit Modal (2 to 4 total photos)
  const handleEditImagesChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const totalAllowed = 4 - editForm.existingImages.length;
      if (totalAllowed <= 0) {
        toast.warning('Maximum 4 photos allowed per item. Please remove an existing photo first.', 'Limit Reached');
        return;
      }
      const validFiles = files.slice(0, totalAllowed);
      const combinedFiles = [...editForm.newImageFiles, ...validFiles].slice(0, totalAllowed);
      const previews = combinedFiles.map(f => URL.createObjectURL(f));

      setEditForm(prev => ({
        ...prev,
        newImageFiles: combinedFiles,
        newImagePreviews: previews
      }));
    }
  };

  const handleRemoveExistingImage = (idxToRemove) => {
    const updated = editForm.existingImages.filter((_, i) => i !== idxToRemove);
    setEditForm(prev => ({ ...prev, existingImages: updated }));
  };

  const handleRemoveNewImage = (idxToRemove) => {
    const updatedFiles = editForm.newImageFiles.filter((_, i) => i !== idxToRemove);
    const updatedPreviews = editForm.newImagePreviews.filter((_, i) => i !== idxToRemove);
    setEditForm(prev => ({ ...prev, newImageFiles: updatedFiles, newImagePreviews: updatedPreviews }));
  };

  // Quick Toggle Disabled State (Move to last when disabled, restore actual position when enabled)
  const handleToggleDisabled = async (prod) => {
    const newDisabled = !prod.isDisabled;
    const updatePayload = { isDisabled: newDisabled };

    // 1. Sync immediately to Central Server API (bridges port 3000 Admin and port 3001 User)
    fetch(`${SERVER_URL}/api/products/${prod.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    }).catch((e) => console.info('Server toggle disable sync notice:', e.message));

    // 2. Update local storage & broadcast channel immediately so UI never lags
    const cached = JSON.parse(localStorage.getItem('gsco_catalog_products') || '[]');
    const updatedList = cached.map(p => p.id === prod.id ? { ...p, ...updatePayload } : p);
    localStorage.setItem('gsco_catalog_products', JSON.stringify(updatedList));

    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      try {
        const channel = new BroadcastChannel('gsco_realtime_channel');
        channel.postMessage({
          type: 'PRODUCT_UPDATED',
          product: { id: prod.id, ...updatePayload }
        });
        channel.close();
      } catch (_) {}
    }

    toast.success(`Product "${prod.title}" ${newDisabled ? 'disabled' : 'enabled'}!`, 'Catalog Updated');

    try {
      await ensureAdminAuth();
      await updateDoc(doc(db, 'products', prod.id), updatePayload);
    } catch (err) {
      console.warn('Firestore toggle disable sync notice:', err.message);
    }
  };

  // Quick Toggle Stock Status (In Stock vs Out of Stock)
  const handleToggleStock = async (prod) => {
    const isCurrentlyInStock = prod.inStock !== false && prod.stockStatus !== 'OUT_OF_STOCK';
    const newInStock = !isCurrentlyInStock;
    const newStatus = newInStock ? 'IN_STOCK' : 'OUT_OF_STOCK';
    const updatePayload = {
      inStock: newInStock,
      stockStatus: newStatus,
      stockQty: newInStock ? 100 : 0
    };

    // 1. Sync immediately to Central Server API
    fetch(`${SERVER_URL}/api/products/${prod.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    }).catch((e) => console.info('Server toggle stock sync notice:', e.message));

    // 2. Update local storage & broadcast channel
    const cached = JSON.parse(localStorage.getItem('gsco_catalog_products') || '[]');
    const updatedList = cached.map(p => p.id === prod.id ? { ...p, ...updatePayload } : p);
    localStorage.setItem('gsco_catalog_products', JSON.stringify(updatedList));

    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      try {
        const channel = new BroadcastChannel('gsco_realtime_channel');
        channel.postMessage({
          type: 'PRODUCT_UPDATED',
          product: { id: prod.id, ...updatePayload }
        });
        channel.close();
      } catch (_) {}
    }

    toast.success(`Product "${prod.title}" marked as ${newInStock ? 'In Stock' : 'Out of Stock'}!`, 'Stock Updated');

    try {
      await ensureAdminAuth();
      await updateDoc(doc(db, 'products', prod.id), updatePayload);
    } catch (err) {
      console.warn('Firestore stock sync notice:', err.message);
    }
  };

  // Save Product Changes (Update with 2-4 Images & Disabled State)
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    const totalImagesCount = editForm.existingImages.length + editForm.newImageFiles.length;
    if (totalImagesCount < 2) {
      toast.warning('Please provide at least 2 photos (up to 4) for this product.', '2 to 4 Photos Required');
      return;
    }

    setUpdating(true);
    const finalUploadedUrls = [...editForm.existingImages];

    try {
      for (let i = 0; i < editForm.newImageFiles.length; i++) {
        const file = editForm.newImageFiles[i];
        let fileUrl = null;

        try {
          const imageRef = ref(storage, `product-images/${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
          const storageTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cloud Storage timeout')), 1800)
          );
          await Promise.race([uploadBytes(imageRef, file), storageTimeout]);
          fileUrl = await getDownloadURL(imageRef);
        } catch (imgErr) {
          console.warn('Storage upload error, using compressed base64 fallback:', imgErr);
          try {
            fileUrl = await compressImage(file, 800, 0.75);
          } catch (_) {
            fileUrl = '/assets/logo.png';
          }
        }
        if (fileUrl) finalUploadedUrls.push(fileUrl);
      }

      const isEditInStock = editForm.stockStatus === 'IN_STOCK';
      const finalEditBpp = Math.max(1, parseInt(editForm.bundlesPerPack, 10) || 1);
      const finalEditPieces = editForm.unit === 'per Piece' ? 1 : (parseInt(editForm.bundlePieces, 10) || 1);

      const updatePayload = {
        title: editForm.title.trim(),
        category: editForm.category.trim(),
        baseRate: parseFloat(editForm.baseRate) || 0,
        unit: editForm.unit,
        bundlePieces: finalEditPieces,
        bundlesPerPack: finalEditBpp,
        inStock: isEditInStock,
        stockStatus: editForm.stockStatus,
        stockQty: isEditInStock ? 100 : 0,
        seasonNotice: editForm.seasonNotice.trim(),
        minOrderNotice: editForm.minOrderNotice.trim(),
        description: editForm.description.trim(),
        imageUrl: finalUploadedUrls[0] || '/assets/logo.png',
        images: finalUploadedUrls.slice(0, 4),
        isDisabled: editForm.isDisabled
      };

      // 1. Authoritative sync to Central Server API (bridges port 3000 Admin and port 3001 User)
      fetch(`${SERVER_URL}/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      }).catch((e) => console.info('Server save edit sync notice:', e.message));

      // 2. Optimistically update local storage & broadcast immediately
      const cached = JSON.parse(localStorage.getItem('gsco_catalog_products') || '[]');
      const updatedList = cached.map(p => p.id === editingProduct.id ? { ...p, ...updatePayload } : p);
      localStorage.setItem('gsco_catalog_products', JSON.stringify(updatedList));

      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        try {
          const channel = new BroadcastChannel('gsco_realtime_channel');
          channel.postMessage({
            type: 'PRODUCT_UPDATED',
            product: { id: editingProduct.id, ...updatePayload }
          });
          channel.close();
        } catch (_) {}
      }

      toast.success(`Product "${updatePayload.title}" updated successfully!`, 'Product Updated');
      setEditingProduct(null);

      // Attempt Firestore write
      try {
        await updateDoc(doc(db, 'products', editingProduct.id), updatePayload);
      } catch (fsErr) {
        console.warn('Firestore update sync notice:', fsErr.message);
      }
    } catch (err) {
      console.error('Update error:', err);
      toast.error('Failed to process image updates: ' + err.message, 'Update Failed');
    } finally {
      setUpdating(false);
    }
  };

  // Modern Confirmation Delete Product
  const handleDelete = (id, title) => {
    toast.confirm({
      title: 'Delete Mat Product?',
      message: `Are you sure you want to permanently delete "${title}"? This will remove it from the live catalog.`,
      confirmText: 'Yes, Delete Product',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        // 1. Authoritative sync to Central Server API (bridges port 3000 Admin and port 3001 User)
        fetch(`${SERVER_URL}/api/products/${id}`, {
          method: 'DELETE'
        }).catch((e) => console.info('Server delete sync notice:', e.message));

        // 2. Optimistically delete from local storage & broadcast
        const cached = JSON.parse(localStorage.getItem('gsco_catalog_products') || '[]');
        const updatedList = cached.filter(p => p.id !== id);
        localStorage.setItem('gsco_catalog_products', JSON.stringify(updatedList));

        if (typeof window !== 'undefined' && window.BroadcastChannel) {
          try {
            const channel = new BroadcastChannel('gsco_realtime_channel');
            channel.postMessage({ type: 'PRODUCT_DELETED', productId: id });
            channel.close();
          } catch (_) {}
        }

        toast.success(`Product "${title}" deleted successfully!`, 'Product Deleted');

        try {
          await ensureAdminAuth();
          await deleteDoc(doc(db, 'products', id));
        } catch (err) {
          console.warn('Firestore delete sync notice:', err.message);
        }
      }
    });
  };

  const baseCategories = [
    { id: 'ALL', label: 'All Products', icon: 'fa-table-cells-large' },
    { id: 'Handloom Mats', label: 'Handloom Mats', icon: 'fa-rug' },
    { id: 'Rubber Mats', label: 'Rubber Mats', icon: 'fa-cubes' },
    { id: 'Fancy Mats', label: 'Fancy Mats', icon: 'fa-wand-magic-sparkles' },
    { id: 'Bed Spreads', label: 'Bed Spreads', icon: 'fa-bed' }
  ];

  const categories = React.useMemo(() => {
    const customTabs = firestoreCategories
      .filter(catName => !baseCategories.some(b => b.id === catName))
      .map(catName => ({ id: catName, label: catName, icon: 'fa-rug' }));
    return [...baseCategories, ...customTabs];
  }, [firestoreCategories]);

  // Filter & Sort products with memoization
  const sortedProducts = React.useMemo(() => {
    const list = products.filter(p => filterCategory === 'ALL' || p.category === filterCategory);
    return list.sort((a, b) => {
      const aDisabled = !!a.isDisabled;
      const bDisabled = !!b.isDisabled;
      if (aDisabled && !bDisabled) return 1;  // a is disabled, move to last
      if (!aDisabled && bDisabled) return -1; // b is disabled, move to last
      
      if (sortOption === 'price-low') {
        return a.baseRate - b.baseRate;
      } else if (sortOption === 'price-high') {
        return b.baseRate - a.baseRate;
      } else if (sortOption === 'stock') {
        return (b.stockQty || 0) - (a.stockQty || 0);
      }
      return 0;
    });
  }, [products, filterCategory, sortOption]);

  return (
    <section className="catalog-section">
      {/* Category Navigation Bar matching Reference Layout */}
      <div className="catalog-nav-bar">
        <div className="category-tabs-group">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`tab-btn-pill ${filterCategory === cat.id ? 'active' : ''}`}
              onClick={() => setFilterCategory(cat.id)}
            >
              <i className={`fa-solid ${cat.icon}`}></i>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Straight-line Section Heading & Modern Sort By */}
      <div className="catalog-section-header-row">
        <h2 className="catalog-section-title">
          {filterCategory === 'ALL' ? 'All Mat Products' : filterCategory} (Admin Management)
        </h2>

        <div className="straight-line-sort-box">
          <label htmlFor="admin-sort-select" className="sort-label">
            <i className="fa-solid fa-arrow-down-short-wide"></i> Sort By:
          </label>
          <select
            id="admin-sort-select"
            className="sort-dropdown-modern"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
          >
            <option value="default">Default Order</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="stock">Stock Quantity</option>
          </select>
        </div>
      </div>

      <div className="pricing-notice-box">
        <i className="fa-solid fa-circle-info"></i>
        <span>
          <strong>Wholesale Pricing Notice:</strong> Quoted rates are factory standard wholesale rates. Final rates may vary based on order quantity, destination & delivery terms.
        </span>
      </div>

      <div className="product-cards-grid">
        {sortedProducts.length === 0 ? (
          <div className="no-products-box">
            <LottieAnimation animationPath="/assets/Error 404.json" width={200} height={180} />
            <h3>No Mat Products Found</h3>
            <p>Upload a product using the form above or on the left.</p>
          </div>
        ) : (
          sortedProducts.map((p) => {
            const isBulkUnit = (p.unit === 'per Bundle' || p.unit === 'per Dozen') && p.bundlePieces > 0;
            const perPieceRate = isBulkUnit ? Math.round(p.baseRate / p.bundlePieces) : 0;
            const isDisabled = !!p.isDisabled;
            const productImages = (Array.isArray(p.images) && p.images.length > 0)
              ? p.images
              : [p.imageUrl || '/assets/logo.jpg'];
            const activeIdx = activeCardImages[p.id] || 0;
            const currentImg = productImages[activeIdx] || productImages[0];

            return (
              <div
                key={p.id}
                className={`product-card ${isDisabled ? 'product-card-disabled' : ''}`}
              >
                {/* Card Top Bar */}
                <div className="card-top-bar">
                  <span className="card-category-badge">{p.category}</span>
                  {productImages.length > 1 && (
                    <span className="card-bundle-pill" style={{ background: '#fdf4ff', color: '#9e2267', borderColor: '#f5d0fe' }}>
                      <i className="fa-solid fa-camera" style={{ marginRight: '0.25rem' }}></i>
                      {productImages.length} Photos
                    </span>
                  )}
                  {isBulkUnit && (
                    <span className="card-bundle-pill">
                      {p.bundlePieces} Pcs/{p.unit.replace('per ', '')}
                    </span>
                  )}
                  {p.bundlesPerPack && (
                    <span className="card-bundle-pill" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
                      <i className="fa-solid fa-cube" style={{ marginRight: '0.2rem' }}></i>
                      1 Bale = {p.bundlesPerPack} {p.unit === 'per Piece' ? 'Pcs' : 'Bundles'}
                    </span>
                  )}
                  {isDisabled && (
                    <span style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}>
                      <i className="fa-solid fa-ban"></i> Disabled (Moved to Last)
                    </span>
                  )}
                </div>

                {/* Card Main Split */}
                <div className="card-main-split">
                  <div className="card-image-box" style={{ position: 'relative' }}>
                    <img
                      src={currentImg}
                      alt={p.title}
                      className="card-product-img"
                      onError={(e) => { e.target.src = '/assets/logo.jpg'; }}
                    />
                    {productImages.length > 1 && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '5px',
                        position: 'absolute',
                        bottom: '8px',
                        left: 0,
                        right: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        width: 'fit-content',
                        margin: '0 auto',
                        zIndex: 2
                      }}>
                        {productImages.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveCardImages(prev => ({ ...prev, [p.id]: idx }))}
                            style={{
                              width: activeIdx === idx ? '16px' : '7px',
                              height: '7px',
                              borderRadius: '4px',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              background: activeIdx === idx ? '#c89a4b' : 'rgba(255,255,255,0.7)',
                              transition: 'all 0.2s ease'
                            }}
                            title={`Photo ${idx + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card-info-col">
                    <h3 className="card-title">{p.title}</h3>
                    <p className="card-desc">{p.description || 'Quality woven mat product.'}</p>

                    <div className="card-tags-list">
                      <div className="card-tag-yellow">
                        <i className="fa-solid fa-box-open"></i>
                        <span>{p.minOrderNotice || (isBulkUnit ? 'Purchased per full Bundle only' : 'Available for purchase')}</span>
                      </div>
                      <div className="card-tag-yellow">
                        <i className="fa-solid fa-circle-info"></i>
                        <span>{p.seasonNotice || 'Price may differ based on quantity & location'}</span>
                      </div>
                    </div>

                    <div className="card-stock-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <i className="fa-solid fa-warehouse"></i>
                      <span>Stock Status: </span>
                      <strong style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: (p.inStock !== false && p.stockStatus !== 'OUT_OF_STOCK') ? '#15803d' : '#b91c1c'
                      }}>
                        {(p.inStock !== false && p.stockStatus !== 'OUT_OF_STOCK') ? 'In Stock' : 'Out of Stock'}
                      </strong>
                      {isDisabled && <span style={{ color: '#ef4444', marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 600 }}>• Disabled</span>}
                    </div>
                  </div>
                </div>

                {/* Card Footer: Rate on left, Admin Actions on right */}
                <div className="card-footer-row">
                  <div className="card-rate-col">
                    <span className="card-rate-label">WHOLESALE RATE</span>
                    <div className="card-rate-price">
                      ₹{p.baseRate ? p.baseRate.toLocaleString('en-IN') : 0}
                      <span className="card-rate-unit">/{p.unit ? p.unit.replace('per ', '') : 'Bundle'}</span>
                    </div>
                    {isBulkUnit && (
                      <div className="card-per-pc-hint">(~ ₹{perPieceRate.toLocaleString('en-IN')}/pc)</div>
                    )}
                  </div>

                  <div className="card-admin-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="btn-select-pill"
                      style={{ padding: '0.5rem 0.95rem', fontSize: '0.82rem' }}
                      onClick={() => handleStartEdit(p)}
                    >
                      <i className="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                    <button
                      type="button"
                      className="btn-select-pill"
                      style={{
                        background: isDisabled ? '#16a34a' : '#d97706',
                        padding: '0.5rem 0.95rem',
                        fontSize: '0.82rem'
                      }}
                      onClick={() => handleToggleDisabled(p)}
                      title={isDisabled ? 'Enable product and restore actual position' : 'Disable product and move to last'}
                    >
                      <i className={`fa-solid ${isDisabled ? 'fa-eye' : 'fa-eye-slash'}`}></i> {isDisabled ? 'Enable' : 'Disable'}
                    </button>
                    <button
                      type="button"
                      className="btn-select-pill"
                      style={{ background: '#ef4444', padding: '0.5rem 0.85rem', fontSize: '0.82rem' }}
                      onClick={() => handleDelete(p.id, p.title)}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* EDIT PRODUCT MODAL */}
      {editingProduct && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '580px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              borderBottom: '1px solid #e2e8f0',
              paddingBottom: '0.85rem'
            }}>
              <div>
                <h3 style={{
                  color: 'var(--brand-navy)',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  margin: 0,
                  fontFamily: "'Outfit', sans-serif",
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <i className="fa-solid fa-pen-to-square" style={{ color: 'var(--brand-gold)' }}></i>
                  Edit Mat Product
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Update details, pricing, stock availability and product image
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  color: '#64748b',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Product Photos Section (2 to 4 Photos) */}
              <div style={{
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '12px',
                border: '1.5px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: 'var(--brand-navy)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    margin: 0
                  }}>
                    <i className="fa-solid fa-images" style={{ color: 'var(--brand-magenta)' }}></i>
                    Product Photos ({editForm.existingImages.length + editForm.newImagePreviews.length} / 4)
                  </label>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: (editForm.existingImages.length + editForm.newImagePreviews.length) < 2 ? '#b91c1c' : '#15803d'
                  }}>
                    {(editForm.existingImages.length + editForm.newImagePreviews.length) < 2 ? '⚠️ Min 2 photos required' : '✓ 2 to 4 Photos'}
                  </span>
                </div>

                {/* Thumbnails grid */}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {editForm.existingImages.map((imgUrl, idx) => (
                    <div key={`existing-${idx}`} style={{ position: 'relative', width: '74px', height: '74px' }}>
                      <img
                        src={imgUrl}
                        alt={`Photo ${idx + 1}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          border: idx === 0 ? '2px solid #c89a4b' : '1px solid #cbd5e1',
                          background: '#fff'
                        }}
                        onError={(e) => { e.target.src = '/assets/logo.jpg'; }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: '2px',
                        left: '2px',
                        background: idx === 0 ? '#c89a4b' : 'rgba(15,23,42,0.7)',
                        color: '#fff',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: '4px'
                      }}>
                        {idx === 0 ? 'Cover' : `#${idx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingImage(idx)}
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '0.65rem'
                        }}
                        title="Remove photo"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  ))}

                  {editForm.newImagePreviews.map((previewUrl, idx) => (
                    <div key={`new-${idx}`} style={{ position: 'relative', width: '74px', height: '74px' }}>
                      <img
                        src={previewUrl}
                        alt={`New ${idx + 1}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          border: '1.5px dashed #22c55e',
                          background: '#fff'
                        }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: '2px',
                        left: '2px',
                        background: '#16a34a',
                        color: '#fff',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: '4px'
                      }}>
                        New
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveNewImage(idx)}
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '0.65rem'
                        }}
                        title="Remove new photo"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  ))}

                  {(editForm.existingImages.length + editForm.newImagePreviews.length) < 4 && (
                    <label style={{
                      width: '74px',
                      height: '74px',
                      border: '2px dashed #94a3b8',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      background: '#ffffff',
                      color: '#64748b',
                      fontSize: '0.68rem',
                      textAlign: 'center',
                      gap: '2px'
                    }}>
                      <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: '1rem', color: '#9e2267' }}></i>
                      <span>Add</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleEditImagesChange}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
                <small style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Provide 2 to 4 photos per item (Cover photo, pattern details, packaging angle).
                </small>
              </div>

              {/* Product Status: Active / Disabled Banner */}
              <div style={{
                background: editForm.isDisabled ? '#fef2f2' : '#eff6ff',
                border: `1.5px solid ${editForm.isDisabled ? '#fca5a5' : '#bfdbfe'}`,
                borderRadius: '12px',
                padding: '0.85rem 1.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <strong style={{
                    fontSize: '0.86rem',
                    color: editForm.isDisabled ? '#991b1b' : '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}>
                    <i className={`fa-solid ${editForm.isDisabled ? 'fa-ban' : 'fa-circle-check'}`}></i>
                    Product Status: {editForm.isDisabled ? 'Disabled (Hidden / Moved to End)' : 'Active (Visible on Catalog)'}
                  </strong>
                </div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  color: editForm.isDisabled ? '#991b1b' : 'var(--brand-navy)'
                }}>
                  <input
                    type="checkbox"
                    checked={editForm.isDisabled}
                    onChange={(e) => setEditForm({ ...editForm, isDisabled: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ef4444' }}
                  />
                  Disable
                </label>
              </div>

              {/* Title / Name */}
              <div className="form-group">
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <i className="fa-solid fa-tag" style={{ color: 'var(--brand-gold)' }}></i>
                  Mat Name / Title
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="e.g. Heavy Duty Panipat Door Mat"
                  required
                />
              </div>

              {/* Category & Base Rate (2-Column Grid) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <i className="fa-solid fa-layer-group" style={{ color: 'var(--brand-gold)' }}></i>
                    Category
                  </label>
                  <select
                    className="form-control"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  >
                    <option value="Handloom Mats">Handloom Mats</option>
                    <option value="Rubber Mats">Rubber Mats</option>
                    <option value="Fancy Mats">Fancy Mats</option>
                    <option value="Bed Spreads">Bed Spreads</option>
                    <option value="Panipat Mat">Panipat Mat</option>
                    <option value="Export Mat">Export Mat</option>
                    <option value="Local Mat">Local Mat</option>
                    <option value="Long Mat">Long Mat</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <i className="fa-solid fa-indian-rupee-sign" style={{ color: 'var(--brand-gold)' }}></i>
                    Rate (₹ / {editForm.unit.replace('per ', '')})
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    value={editForm.baseRate}
                    onChange={(e) => setEditForm({ ...editForm, baseRate: e.target.value })}
                    required
                    min="1"
                  />
                  <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                    {editForm.unit === 'per Piece'
                      ? 'Price for 1 single piece'
                      : editForm.baseRate && editForm.bundlePieces
                        ? `Price for 1 full bundle (~ ₹${Math.round(parseFloat(editForm.baseRate) / editForm.bundlePieces)} / pc)`
                        : `Price for 1 full ${editForm.unit.replace('per ', '')}`}
                  </small>
                </div>
              </div>

              {/* Selling Unit & Stock Availability (2-Column Grid) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <i className="fa-solid fa-ruler-combined" style={{ color: 'var(--brand-gold)' }}></i>
                    Selling Unit
                  </label>
                  <select
                    className="form-control"
                    value={editForm.unit}
                    onChange={(e) => {
                      const newUnit = e.target.value;
                      setEditForm((prev) => ({
                        ...prev,
                        unit: newUnit,
                        bundlePieces: newUnit === 'per Piece' ? 1 : (prev.bundlePieces || 10),
                        minOrderNotice: newUnit === 'per Piece'
                          ? 'Available for individual piece purchase'
                          : `Purchased per full ${newUnit.replace('per ', '')} (${prev.bundlePieces || 10} Pcs only)`
                      }));
                    }}
                  >
                    <option value="per Bundle">per Bundle</option>
                    <option value="per Piece">per Piece</option>
                    <option value="per Dozen">per Dozen</option>
                    <option value="per Meter">per Meter</option>
                    <option value="per Feet">per Feet</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <i className="fa-solid fa-warehouse" style={{ color: 'var(--brand-gold)' }}></i>
                    Stock Availability
                  </label>
                  <select
                    className="form-control"
                    value={editForm.stockStatus || 'IN_STOCK'}
                    onChange={(e) => setEditForm({ ...editForm, stockStatus: e.target.value })}
                    style={{
                      fontWeight: 700,
                      color: editForm.stockStatus === 'IN_STOCK' ? '#15803d' : '#b91c1c',
                      backgroundColor: editForm.stockStatus === 'IN_STOCK' ? '#f0fdf4' : '#fef2f2',
                      borderColor: editForm.stockStatus === 'IN_STOCK' ? '#86efac' : '#fca5a5'
                    }}
                  >
                    <option value="IN_STOCK">In Stock</option>
                    <option value="OUT_OF_STOCK">Out of Stock</option>
                  </select>
                </div>
              </div>

              {/* Packaging Details: Pieces per Bundle & Bundles / Pieces per Master Bale */}
              <div style={{ display: 'grid', gridTemplateColumns: (editForm.unit === 'per Bundle' || editForm.unit === 'per Dozen') ? '1fr 1fr' : '1fr', gap: '1rem' }}>
                {(editForm.unit === 'per Bundle' || editForm.unit === 'per Dozen') && (
                  <div className="form-group">
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <i className="fa-solid fa-boxes-packing" style={{ color: 'var(--brand-gold)' }}></i>
                      Pieces per {editForm.unit.replace('per ', '')}
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      value={editForm.bundlePieces}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setEditForm((prev) => ({
                          ...prev,
                          bundlePieces: val,
                          minOrderNotice: `Purchased per full ${prev.unit.replace('per ', '')} (${val} Pcs only)`
                        }));
                      }}
                      min="1"
                      required
                    />
                    <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                      Pieces in 1 bundle
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <i className="fa-solid fa-cube" style={{ color: 'var(--brand-gold)' }}></i>
                    {(editForm.unit === 'per Bundle' || editForm.unit === 'per Dozen') ? 'Bundles / Master Bale' : 'Pieces / Master Bale'}
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    value={editForm.bundlesPerPack}
                    onChange={(e) => setEditForm({ ...editForm, bundlesPerPack: e.target.value })}
                    min="1"
                    required
                  />
                  <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                    {(editForm.unit === 'per Bundle' || editForm.unit === 'per Dozen')
                      ? 'Bundles that fit into 1 Master Bale (e.g. 3 for Robo, 8 for 13x19)'
                      : 'Total pieces that fit into 1 Master Bale'}
                  </small>
                </div>
              </div>

              {/* Season Notice */}
              <div className="form-group">
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b45309', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <i className="fa-solid fa-tags"></i>
                  Season & Stock Price Notice
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.seasonNotice}
                  onChange={(e) => setEditForm({ ...editForm, seasonNotice: e.target.value })}
                  placeholder="Price may differ based on the season item or the stock quantity"
                />
              </div>

              {/* Purchase Rule Notice */}
              <div className="form-group">
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <i className="fa-solid fa-cart-flatbed" style={{ color: 'var(--brand-gold)' }}></i>
                  Purchase Rule Notice
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.minOrderNotice}
                  onChange={(e) => setEditForm({ ...editForm, minOrderNotice: e.target.value })}
                  placeholder="Purchased per full Bundle (10 Pcs only)"
                />
              </div>

              {/* Description */}
              <div className="form-group">
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <i className="fa-solid fa-align-left" style={{ color: 'var(--brand-gold)' }}></i>
                  Description
                </label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Product dimensions, color patterns, material details..."
                ></textarea>
              </div>

              {/* Action Buttons Footer */}
              <div style={{
                display: 'flex',
                gap: '0.75rem',
                justify: 'flex-end',
                marginTop: '0.5rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e2e8f0'
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingProduct(null)}
                >
                  <i className="fa-solid fa-xmark"></i> Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="btn btn-primary"
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  {updating ? 'Saving...' : 'Save Product Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
