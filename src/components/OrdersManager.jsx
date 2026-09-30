import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, doc, updateDoc, setDoc, serverTimestamp, query, orderBy, limit, getDoc } from '../firebase';
import { toast } from '../utils/toast';
import { printBaleSlips } from '../utils/baleSlipGenerator';
import LottieAnimation from './LottieAnimation';

export default function OrdersManager({ onBackToCatalog }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBales, setExpandedBales] = useState({}); // { [orderId]: balesArray | null }
  const [globalBaleRate, setGlobalBaleRate] = useState(100);
  const [editingOrderRate, setEditingOrderRate] = useState({}); // { [orderId]: string }

  // Subscribe to global master bale rate from Firestore settings/master_bale_config
  useEffect(() => {
    const configDocRef = doc(db, 'settings', 'master_bale_config');
    const unsubscribeConfig = onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const activeRate = data.rate !== undefined && data.rate !== null ? Number(data.rate) : 100;
        setGlobalBaleRate(activeRate);
      } else {
        // Initialize default ₹100 if document does not exist
        setDoc(configDocRef, {
          rate: 100,
          unit: 'per Master Bale',
          description: 'Global default rate per packed Master Bale applied to all customer orders',
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
    }, (err) => {
      console.warn('Master bale config sync notice:', err.message);
    });

    return () => unsubscribeConfig();
  }, []);

  // Subscribe to real-time wholesale orders from Firestore (bounded to latest 50 orders)
  useEffect(() => {
    const ordersQuery = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));

      // Sort by newest first
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setOrders(fetched);
      setLoading(false);
    }, (err) => {
      console.warn('Orders Firestore real-time sync notice:', err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
      toast.success(`Order status updated to ${newStatus}`, 'Order Status Updated');
    } catch (err) {
      console.error('Failed to update order status:', err);
      toast.error('Failed to update order status: ' + err.message, 'Update Error');
    }
  };

  const handleUpdateOrderBaleRate = async (ord, newRateStr) => {
    const newRate = parseFloat(newRateStr);
    if (isNaN(newRate) || newRate < 0) {
      toast.error('Please enter a valid non-negative rate (e.g. 100).', 'Invalid Rate');
      return;
    }
    const itemsSubtotal = ord.itemsSubtotal !== undefined
      ? ord.itemsSubtotal
      : (ord.items || []).reduce((s, item) => s + ((item.qty || 1) * (item.unitRate || item.baseRate || 0)), 0);
    const estBales = ord.estBales || 1;
    const masterBaleTotal = estBales * newRate;
    const grandTotal = itemsSubtotal + masterBaleTotal;

    try {
      await updateDoc(doc(db, 'orders', ord.id), {
        masterBaleRate: newRate,
        masterBaleTotal,
        grandTotal
      });
      setEditingOrderRate((prev) => {
        const next = { ...prev };
        delete next[ord.id];
        return next;
      });
      toast.success(`Updated Bale Rate for ${ord.companyName || 'order'} to ₹${newRate}/bale!`, 'Order Rate Updated');
    } catch (err) {
      console.error('Failed to update order bale rate:', err);
      toast.error('Failed to update rate: ' + err.message, 'Update Failed');
    }
  };

  const toggleBaleDetail = async (orderId) => {
    // If already loaded and visible, collapse
    if (expandedBales[orderId] !== undefined) {
      setExpandedBales((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
      return;
    }

    // 1. Check if the order document already contains the pre-computed bales array
    const localOrder = orders.find((o) => o.id === orderId);
    if (localOrder && Array.isArray(localOrder.bales) && localOrder.bales.length > 0) {
      setExpandedBales((prev) => ({ ...prev, [orderId]: localOrder.bales }));
      return;
    }

    // 2. Otherwise fetch bale detail from Firestore master_bales/{orderId}
    try {
      const snap = await getDoc(doc(db, 'master_bales', orderId));
      if (snap.exists()) {
        setExpandedBales((prev) => ({ ...prev, [orderId]: snap.data().bales || [] }));
      } else {
        setExpandedBales((prev) => ({ ...prev, [orderId]: null }));
        toast.info('Bale allocation not yet calculated for this order.', 'No Bale Data');
      }
    } catch (err) {
      console.warn('Failed to fetch bale detail:', err.message);
      setExpandedBales((prev) => ({ ...prev, [orderId]: null }));
    }
  };

  const filteredOrders = orders.filter((ord) => {
    const matchesStatus = filterStatus === 'ALL' || ord.status === filterStatus;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      (ord.companyName && ord.companyName.toLowerCase().includes(searchLower)) ||
      (ord.contactPerson && ord.contactPerson.toLowerCase().includes(searchLower)) ||
      (ord.phone && ord.phone.includes(searchTerm));
    return matchesStatus && matchesSearch;
  });

  const pendingCount = orders.filter(o => o.status === 'PENDING' || !o.status).length;
  const confirmedCount = orders.filter(o => o.status === 'CONFIRMED').length;
  const shippedCount = orders.filter(o => o.status === 'SHIPPED').length;
  const cancelledCount = orders.filter(o => o.status === 'CANCELLED').length;

  return (
    <div className="orders-page-container">
      {/* Top Header & Summary Bar */}
      <div className="orders-page-header">
        <div className="header-left-group">
          <div>
            <h1 className="orders-page-title">
              <i className="fa-solid fa-file-invoice-dollar" style={{ color: '#0284c7' }}></i>
              Wholesale Customer Orders
            </h1>
            <p className="orders-page-subtitle">
              Manage real-time customer inquiries, packing, dispatch stickers, and invoices
            </p>
          </div>
        </div>

        {/* Status Counts Bar */}
        <div className="orders-status-summary">
          <span className="stat-pill stat-total">
            Total: <strong>{orders.length}</strong>
          </span>
          <span className="stat-pill stat-pending">
            <i className="fa-solid fa-clock"></i> {pendingCount} Pending
          </span>
          <span className="stat-pill stat-confirmed">
            <i className="fa-solid fa-circle-check"></i> {confirmedCount} Confirmed
          </span>
          {shippedCount > 0 && (
            <span className="stat-pill stat-shipped">
              <i className="fa-solid fa-truck-fast"></i> {shippedCount} Shipped
            </span>
          )}
          {cancelledCount > 0 && (
            <span className="stat-pill stat-cancelled">
              <i className="fa-solid fa-ban"></i> {cancelledCount} Cancelled
            </span>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="orders-filter-bar">
        <div className="search-input-wrapper">
          <i className="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            type="text"
            placeholder="Search by company name, contact person, phone, or delivery address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="orders-search-input"
          />
          {searchTerm && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => setSearchTerm('')}
              title="Clear search"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          )}
        </div>

        <div className="filter-select-wrapper">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="orders-status-select"
          >
            <option value="ALL">All Statuses ({orders.length})</option>
            <option value="PENDING">Pending Inquiry ({pendingCount})</option>
            <option value="CONFIRMED">Confirmed Order ({confirmedCount})</option>
            <option value="SHIPPED">Dispatched / Shipped ({shippedCount})</option>
            <option value="CANCELLED">Cancelled ({cancelledCount})</option>
          </select>
        </div>
      </div>

      {/* Orders Content Area */}
      {loading ? (
        <div className="orders-loading-state">
          <LottieAnimation animationPath="/assets/loading.json" width={120} height={120} />
          <p>Syncing orders in real-time from Cloud Firestore...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="orders-empty-state">
          <LottieAnimation animationPath="/assets/Error 404.json" width={180} height={160} />
          <h3>No Orders Found</h3>
          <p>
            {searchTerm || filterStatus !== 'ALL'
              ? 'No orders match your filter criteria. Try adjusting your search term.'
              : 'Wholesale inquiries submitted from the Customer Portal will appear here automatically.'}
          </p>
          {(searchTerm || filterStatus !== 'ALL') && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => { setSearchTerm(''); setFilterStatus('ALL'); }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="orders-card-grid">
          {filteredOrders.map((ord) => {
            const dateStr = ord.createdAt?.seconds 
              ? new Date(ord.createdAt.seconds * 1000).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : ord.createdAt ? new Date(ord.createdAt).toLocaleString('en-IN') : 'Just now';

            const cleanPhone = (ord.phone || '').replace(/[^0-9]/g, '');

            const itemsSubtotal = ord.itemsSubtotal !== undefined
              ? ord.itemsSubtotal
              : (ord.items || []).reduce((s, item) => s + ((item.qty || 1) * (item.unitRate || item.baseRate || 0)), 0);
            
            const baleRate = ord.masterBaleRate !== undefined && ord.masterBaleRate !== null ? Number(ord.masterBaleRate) : globalBaleRate;
            const estBales = ord.estBales || 1;
            const baleTotal = ord.masterBaleTotal !== undefined && ord.masterBaleRate !== undefined ? Number(ord.masterBaleTotal) : (estBales * baleRate);
            const grandTotal = itemsSubtotal + baleTotal;

            return (
              <div key={ord.id} className="order-card-modern">
                {/* Card Top Header */}
                <div className="order-card-header">
                  <div className="company-info-block">
                    <div className="company-title-row">
                      <i className="fa-solid fa-building company-icon"></i>
                      <h3 className="company-name">{ord.companyName || 'Wholesale Buyer'}</h3>
                    </div>
                    <div className="contact-meta-row">
                      <span className="contact-item">
                        <i className="fa-solid fa-user"></i> {ord.contactPerson || 'N/A'}
                      </span>
                      <span className="contact-item">
                        <i className="fa-solid fa-phone"></i> {ord.phone}
                      </span>
                      {ord.gstNumber && ord.gstNumber !== 'N/A' && (
                        <span className="gst-badge">GST: {ord.gstNumber}</span>
                      )}
                    </div>
                  </div>

                  {/* Status Dropdown Badge */}
                  <div className="order-status-badge-wrapper">
                    <select
                      value={ord.status || 'PENDING'}
                      onChange={(e) => handleUpdateStatus(ord.id, e.target.value)}
                      className={`status-dropdown-badge status-${(ord.status || 'PENDING').toLowerCase()}`}
                      title="Change order status"
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="CONFIRMED">CONFIRMED</option>
                      <option value="SHIPPED">SHIPPED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>
                </div>

                {/* Delivery Address */}
                {ord.deliveryAddress || ord.address ? (
                  <div className="order-address-box">
                    <i className="fa-solid fa-location-dot address-icon"></i>
                    <span>{ord.deliveryAddress || ord.address}</span>
                  </div>
                ) : null}

                {/* Items List Breakdown */}
                {Array.isArray(ord.items) && ord.items.length > 0 && (
                  <div className="order-items-box">
                    <div className="items-header-row">
                      <span className="items-count-label">
                        <i className="fa-solid fa-boxes-stacked"></i> Ordered Mats ({ord.items.length})
                      </span>
                      <span className="items-subtotal-val">
                        Subtotal: <strong>Rs. {itemsSubtotal.toLocaleString('en-IN')}</strong>
                      </span>
                    </div>

                    <div className="items-list-container">
                      {ord.items.map((item, idx) => (
                        <div key={idx} className="item-row">
                          <span className="item-title">
                            {item.title || item.name}
                            <span className="item-qty-tag">
                              ({item.qty} {item.unit || 'Bundle(s)'})
                            </span>
                          </span>
                          <span className="item-price">
                            Rs. {((item.qty || 1) * (item.unitRate || item.baseRate || 0)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Master Bale Charges Row with Global Rate + Override */}
                    <div className="order-bale-charges-row">
                      <div className="bale-charge-calc-group">
                        <span className="bale-charge-pill">
                          📦 Bale Charges: {estBales} Bales @ ₹{baleRate}/bale = <strong>Rs. {baleTotal.toLocaleString('en-IN')}</strong>
                        </span>

                        {editingOrderRate[ord.id] !== undefined ? (
                          <div className="order-rate-edit-group">
                            <input
                              type="number"
                              min="0"
                              value={editingOrderRate[ord.id]}
                              onChange={(e) => setEditingOrderRate(prev => ({ ...prev, [ord.id]: e.target.value }))}
                              placeholder="Rate"
                              className="input-order-rate"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderBaleRate(ord, editingOrderRate[ord.id])}
                              className="btn-save-order-rate"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingOrderRate(prev => { const next = { ...prev }; delete next[ord.id]; return next; })}
                              className="btn-cancel-order-rate"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingOrderRate(prev => ({ ...prev, [ord.id]: String(baleRate) }))}
                            className="btn-override-rate"
                            title="Override Master Bale Rate for this specific order"
                          >
                            <i className="fa-solid fa-pen"></i> Override
                          </button>
                        )}
                      </div>

                      <div className="order-grand-total">
                        <span className="grand-label">Grand Total:</span>
                        <span className="grand-amount">Rs. {grandTotal.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Card Footer Actions */}
                <div className="order-card-footer">
                  <div className="order-meta-info">
                    <span>Est. Bales: <strong>{ord.estBales || 1}</strong></span>
                    <span>Total Units: <strong>{ord.totalUnits || 0}</strong></span>
                    <span className="order-date-tag">
                      <i className="fa-regular fa-clock"></i> {dateStr}
                    </span>
                  </div>

                  <div className="order-action-buttons">
                    {cleanPhone && (
                      <a
                        href={`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Hello ${ord.contactPerson || 'Customer'}, regarding your wholesale order (${ord.companyName || ''}) with SRI SURYA TEX...`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-order-action btn-whatsapp"
                        title="Chat with customer on WhatsApp"
                      >
                        <i className="fa-brands fa-whatsapp"></i>
                        <span>WhatsApp</span>
                      </a>
                    )}

                    {cleanPhone && (
                      <a
                        href={`tel:${cleanPhone}`}
                        className="btn-order-action btn-call"
                        title="Call Customer"
                      >
                        <i className="fa-solid fa-phone"></i>
                      </a>
                    )}

                    {ord.balesPacked && (
                      <button
                        type="button"
                        onClick={() => toggleBaleDetail(ord.id)}
                        className={`btn-order-action btn-bale-plan ${expandedBales[ord.id] !== undefined ? 'active' : ''}`}
                        title="View volumetric packing allocation"
                      >
                        <i className={`fa-solid ${expandedBales[ord.id] !== undefined ? 'fa-chevron-up' : 'fa-layer-group'}`}></i>
                        <span>{expandedBales[ord.id] !== undefined ? 'Hide' : 'Bale Plan'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => printBaleSlips(ord)}
                      className="btn-order-action btn-print-labels"
                      title="Print Master Bale Dispatch Stickers for Gunny Bags"
                    >
                      <i className="fa-solid fa-print"></i>
                      <span>Print Labels</span>
                    </button>
                  </div>
                </div>

                {/* Expandable Bale Allocation Detail */}
                {expandedBales[ord.id] && Array.isArray(expandedBales[ord.id]) && expandedBales[ord.id].length > 0 && (
                  <div className="bale-plan-accordion">
                    <div className="bale-plan-header">
                      <div className="plan-title">
                        <i className="fa-solid fa-boxes-stacked"></i>
                        <span>Bale Allocation Plan ({expandedBales[ord.id].length} Master Bales)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => printBaleSlips({ ...ord, bales: expandedBales[ord.id] })}
                        className="btn-print-all-bales"
                      >
                        <i className="fa-solid fa-print"></i> Print {expandedBales[ord.id].length} Labels
                      </button>
                    </div>

                    <div className="bale-items-grid">
                      {expandedBales[ord.id].map((bale) => (
                        <div key={bale.baleId} className="bale-unit-card">
                          <div className="bale-unit-top">
                            <span className="bale-unit-id">
                              <i className="fa-solid fa-cube"></i> {bale.baleId}
                            </span>
                            <div className="bale-progress-bar">
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${Math.min(100, parseFloat(bale.capacityPercent))}%`,
                                  backgroundColor: parseFloat(bale.capacityPercent) >= 90 ? '#16a34a' : parseFloat(bale.capacityPercent) >= 60 ? '#d97706' : '#2563eb'
                                }}
                              ></div>
                            </div>
                            <span className="bale-cap-text">{bale.capacityPercent}% full</span>
                          </div>

                          <div className="bale-items-chips">
                            {bale.items.map((item) => (
                              <span key={item.itemId} className="bale-item-chip">
                                {item.title}: {item.bundleQty}B · {item.capacityPercent}%
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
