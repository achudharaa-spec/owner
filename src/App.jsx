import React, { useState, useEffect, useRef } from 'react';
import { db, collection, onSnapshot, auth, onAuthStateChanged, signOut, signInWithEmailAndPassword, doc, setDoc, serverTimestamp } from './firebase';
import Login from './components/Login';
import Header from './components/Header';
import ProductForm from './components/ProductForm';
import ProductGrid from './components/ProductGrid';
import OrdersManager from './components/OrdersManager';
import BaleInfoModal from './components/BaleInfoModal';
import AuditLogs from './components/AuditLogs';
import ModernToastContainer from './components/ModernToastContainer';
import LottieAnimation from './components/LottieAnimation';
import { toast } from './utils/toast';
import './styles.css';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes Inactivity Timeout
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:10000';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return sessionStorage.getItem('sst_admin_session') === 'true' || localStorage.getItem('sst_admin_session') === 'true';
  });
  const [authChecking, setAuthChecking] = useState(false);
  const [products, setProducts] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('gsco_catalog_products') || '[]');
      if (Array.isArray(cached) && cached.length > 0) return cached;
    } catch (_) {}
    return [];
  });
  const [isBaleInfoModalOpen, setIsBaleInfoModalOpen] = useState(false);
  const [activeView, setActiveView] = useState('CATALOG'); // 'CATALOG' | 'ORDERS'
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [hidePrices, setHidePrices] = useState(true); // Default: Prices hidden for customers
  const lastActivityRef = useRef(Date.now());

  // Listen to Firebase Auth state & verify admin custom claim
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const idToken = await user.getIdTokenResult(true);
          const configuredAdmin = (import.meta.env.VITE_ADMIN_EMAIL || 'achudharaa@gmail.com').toLowerCase().trim();
          const userEmail = (user.email || '').toLowerCase().trim();
          const hasAdminClaim = idToken.claims.admin === true || 
            (configuredAdmin && userEmail === configuredAdmin) ||
            userEmail === 'achudharaa@gmail.com';
          if (hasAdminClaim) {
            setIsLoggedIn(true);
            sessionStorage.setItem('sst_admin_session', 'true');
            localStorage.setItem('sst_admin_session', 'true');
          }
        } catch (e) {
          console.error('Failed to verify admin claims:', e);
        }
      }
      setAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time Central Server REST/SSE, Firestore & Cross-Tab Broadcast Sync
  useEffect(() => {
    if (!isLoggedIn) return;

    // 1. Initial load from local cache
    const cached = JSON.parse(localStorage.getItem('gsco_catalog_products') || '[]');
    if (cached.length > 0) {
      setProducts(cached);
    }

    // 2. Fetch live products from Centralized Server API & Auto-Sync any local-only items
    fetch(`${SERVER_URL}/api/products`)
      .then((res) => (res.ok ? res.json() : null))
      .then(async (serverProducts) => {
        if (Array.isArray(serverProducts)) {
          // If local cache had products created offline / prior to server sync, auto-push them to server
          if (cached.length > 0) {
            const serverIds = new Set(serverProducts.map((p) => p.id));
            const unsyncedLocals = cached.filter((p) => !serverIds.has(p.id));
            for (const localItem of unsyncedLocals) {
              try {
                await fetch(`${SERVER_URL}/api/products`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(localItem)
                });
                serverProducts.unshift(localItem);
              } catch (_) {}
            }
          }

          if (serverProducts.length > 0) {
            setProducts(serverProducts);
            localStorage.setItem('gsco_catalog_products', JSON.stringify(serverProducts));
          }
        }
      })
      .catch((err) => console.info('Server catalog sync info:', err.message));

    // 3. Fetch live store config (hidePrices) from Server API
    fetch(`${SERVER_URL}/api/settings/store_config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg && cfg.hidePrices !== undefined) {
          setHidePrices(Boolean(cfg.hidePrices));
          localStorage.setItem('sst_hide_prices', cfg.hidePrices ? 'true' : 'false');
        }
      })
      .catch((err) => console.info('Server store config sync info:', err.message));

    // 4. Connect to Server-Sent Events (SSE) stream for instant real-time sync across ports 3000 & 3001
    let eventSource;
    try {
      eventSource = new EventSource(`${SERVER_URL}/api/events`);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'PRODUCT_ADDED') {
            setProducts((prev) => {
              if (prev.some((p) => p.id === data.product.id)) return prev;
              const updated = [data.product, ...prev];
              localStorage.setItem('gsco_catalog_products', JSON.stringify(updated));
              return updated;
            });
          } else if (data.type === 'PRODUCT_UPDATED') {
            setProducts((prev) => {
              const updated = prev.map((p) => (p.id === data.product.id ? { ...p, ...data.product } : p));
              localStorage.setItem('gsco_catalog_products', JSON.stringify(updated));
              return updated;
            });
          } else if (data.type === 'PRODUCT_DELETED') {
            setProducts((prev) => {
              const updated = prev.filter((p) => p.id !== data.productId);
              localStorage.setItem('gsco_catalog_products', JSON.stringify(updated));
              return updated;
            });
          } else if (data.type === 'STORE_CONFIG_UPDATED') {
            if (data.hidePrices !== undefined) {
              setHidePrices(Boolean(data.hidePrices));
              localStorage.setItem('sst_hide_prices', data.hidePrices ? 'true' : 'false');
            }
          } else if (data.type === 'ORDER_PLACED') {
            const ord = data.order;
            setPendingOrdersCount((c) => c + 1);
            toast.info(`Company: ${ord.companyName || 'Wholesale Buyer'} | Phone: ${ord.phone || 'N/A'} | Est. Bales: ${ord.estBales || 1}`, '🔔 Wholesale Indent Placed');
          }
        } catch (_) {}
      };
    } catch (_) {}

    // 5. Listen to real-time events across tabs within the same origin
    let channel;
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      channel = new BroadcastChannel('gsco_realtime_channel');
      channel.onmessage = (event) => {
        if (event.data?.type === 'PRODUCT_ADDED') {
          setProducts((prev) => {
            if (prev.some((p) => p.id === event.data.product.id)) return prev;
            return [event.data.product, ...prev];
          });
        } else if (event.data?.type === 'PRODUCT_UPDATED') {
          setProducts((prev) =>
            prev.map((p) => (p.id === event.data.product.id ? { ...p, ...event.data.product } : p))
          );
        } else if (event.data?.type === 'PRODUCT_DELETED') {
          setProducts((prev) => prev.filter((p) => p.id !== event.data.productId));
        } else if (event.data?.type === 'ORDER_PLACED') {
          const ord = event.data.order;
          setPendingOrdersCount((c) => c + 1);
          toast.info(`Company: ${ord.companyName} | Phone: ${ord.phone} | Est. Bales: ${ord.estBales || 1}`, '🔔 Wholesale Order Received');
        }
      };
    }

    // 6. Real-time Firestore sync as supplementary cloud backup
    const productsRef = collection(db, 'products');
    const unsubscribeProducts = onSnapshot(productsRef, (snapshot) => {
      const fetched = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      if (fetched.length > 0) {
        setProducts(fetched);
        localStorage.setItem('gsco_catalog_products', JSON.stringify(fetched));
      }
    }, (error) => {
      console.warn('Firestore real-time sync info:', error.message);
    });

    // Real-time listener for pending orders count
    const ordersRef = collection(db, 'orders');
    const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
      const pending = snapshot.docs.filter(
        (d) => d.data().status === 'PENDING' || !d.data().status
      ).length;
      setPendingOrdersCount(pending);
    }, (err) => {
      console.warn('Orders count sync info:', err.message);
    });

    return () => {
      if (eventSource) eventSource.close();
      unsubscribeProducts();
      unsubscribeOrders();
      if (channel) channel.close();
    };
  }, [isLoggedIn]);

  // 15-Minute Inactivity Auto-Logout Tracker
  useEffect(() => {
    if (!isLoggedIn) return;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, resetTimer));

    const checkInterval = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= INACTIVITY_TIMEOUT_MS) {
        toast.warning('You were automatically logged out due to 15 minutes of inactivity.', '⏱️ Session Expired');
        handleLogout();
      }
    }, 10000); // Check every 10 seconds

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
      clearInterval(checkInterval);
    };
  }, [isLoggedIn]);

  // Sync store_config from Firestore for Customer Price Visibility
  useEffect(() => {
    if (!isLoggedIn) return;

    const configDocRef = doc(db, 'settings', 'store_config');
    const unsubscribeConfig = onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.hidePrices !== undefined) {
          setHidePrices(Boolean(data.hidePrices));
        }
      } else {
        setDoc(configDocRef, {
          hidePrices: true,
          companyName: 'SRI SURYA TEX',
          contactPerson: 'P. MYILSAMY',
          phone: '98426 86264',
          gst: '33DBQPM1973N1ZY',
          address: '185, Eswaran Kovil Kidangu Street, ERODE - 638 001',
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
    }, (err) => {
      console.warn('Store config sync notice:', err.message);
    });

    return () => unsubscribeConfig();
  }, [isLoggedIn]);

  const handleToggleHidePrices = async () => {
    const nextVal = !hidePrices;
    setHidePrices(nextVal);
    localStorage.setItem('sst_hide_prices', nextVal ? 'true' : 'false');

    // 1. Authoritative sync to Central Server API (bridges port 3000 Admin and port 3001 User)
    fetch(`${SERVER_URL}/api/settings/store_config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidePrices: nextVal })
    }).catch((e) => console.info('Server store config sync notice:', e.message));

    // 2. Broadcast across tabs in the same origin
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      try {
        const channel = new BroadcastChannel('gsco_realtime_channel');
        channel.postMessage({ type: 'STORE_CONFIG_UPDATED', hidePrices: nextVal });
        channel.close();
      } catch (_) {}
    }

    toast.info(
      nextVal ? 'Product prices are now HIDDEN from the customer portal.' : 'Product prices are now VISIBLE on the customer portal.',
      'Customer Price Visibility'
    );

    // 3. Cloud Firestore primary database sync
    try {
      if (!auth.currentUser) {
        const configuredAdmin = (import.meta.env.VITE_ADMIN_EMAIL || 'achudharaa@gmail.com').trim();
        const customPass = import.meta.env.VITE_ADMIN_PASSWORD || 'SriSuryaTex@2026';
        try {
          await signInWithEmailAndPassword(auth, configuredAdmin, customPass);
        } catch (_) {}
      }
      const configDocRef = doc(db, 'settings', 'store_config');
      await setDoc(configDocRef, {
        hidePrices: nextVal,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore price visibility sync notice:', err.message);
      toast.warning('Cloud database sync pending. Please ensure admin is authenticated.', 'Cloud Sync Warning');
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('sst_admin_session');
    localStorage.removeItem('sst_admin_session');
    sessionStorage.removeItem('sst_admin_identifier');
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Sign out error:', e);
    }
    setIsLoggedIn(false);
  };

  if (authChecking) {
    return (
      <div className="auth-loading-screen">
        <LottieAnimation animationPath="/assets/loading.json" width={130} height={130} />
        <p>Verifying secure admin authorization...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <ModernToastContainer />
        <Login
          onLoginSuccess={() => {
            setIsLoggedIn(true);
          }}
        />
      </>
    );
  }

  return (
    <div className="app-container">
      <ModernToastContainer />
      <Header
        totalProducts={products.length}
        onLogout={handleLogout}
        onOpenBaleInfo={() => setIsBaleInfoModalOpen(true)}
        activeView={activeView}
        onNavigateView={(view) => setActiveView(view)}
        pendingOrdersCount={pendingOrdersCount}
        hidePrices={hidePrices}
        onToggleHidePrices={handleToggleHidePrices}
      />

      {activeView === 'CATALOG' ? (
        <main className="main-layout">
          <ProductForm />
          <ProductGrid products={products} />
          <AuditLogs />
        </main>
      ) : (
        <main className="orders-page-layout">
          <OrdersManager />
        </main>
      )}

      {/* Bale Info & Global Rate Configuration Pop-up Modal */}
      <BaleInfoModal
        isOpen={isBaleInfoModalOpen}
        onClose={() => setIsBaleInfoModalOpen(false)}
      />
    </div>
  );
}
