/* =====================================================
   Bookshop — script.js
   Barcha sahifalarda ishlaydi (index, categories/*, register, signup).
   Imkoniyatlar:
     1. Savat (Buy tugmasi, miqdor, jami narx, localStorage)
     2. Toast xabarlar
     3. Ro'yxatdan o'tish (register) validatsiyasi
     4. Kirish (signup sahifasi) va header'dagi foydalanuvchi holati
     5. Category sahifalarida narx bo'yicha saralash
     6. Help havolasi va yumshoq scroll tuzatishi
   ===================================================== */
(function () {
    'use strict';

    /* ---------- Yordamchi funksiyalar ---------- */
    var IN_CATEGORY = location.pathname.indexOf('/categories/') !== -1;
    var ROOT = IN_CATEGORY ? '../' : './';

    var CART_KEY = 'bookshop_cart';
    var USER_KEY = 'bookshop_user';
    var SESSION_KEY = 'bookshop_logged_in';

    function load(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function save(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* private rejim — e'tibor bermaymiz */ }
    }

    function remove(key) {
        try { localStorage.removeItem(key); } catch (e) { }
    }

    function money(n) {
        return n.toFixed(2) + '$';
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // "../thriller category/Rebekka.webp" -> "thriller category/Rebekka.webp"
    function normalizeSrc(src) {
        return decodeURIComponent(src).replace(/^(\.\.\/|\.\/)+/, '');
    }

    /* ---------- Kitoblar bazasi (books.js) ---------- */
    var BOOKS = window.BOOKS || [];
    var BY_IMG = {};
    BOOKS.forEach(function (b) { BY_IMG[b.img] = b; });

    function bookUrl(b) {
        return ROOT + 'book.html?id=' + encodeURIComponent(b.id);
    }

    /* ---------- Toast ---------- */
    function toast(message, type) {
        var box = document.getElementById('toast-box');
        if (!box) {
            box = document.createElement('div');
            box.id = 'toast-box';
            document.body.appendChild(box);
        }
        var t = document.createElement('div');
        t.className = 'toast' + (type ? ' toast-' + type : '');
        t.textContent = message;
        box.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 300);
        }, 2400);
    }

    /* =====================================================
       1. SAVAT
       ===================================================== */
    var cart = load(CART_KEY, []); // [{id, title, price, img, qty}]

    function saveCart() { save(CART_KEY, cart); }

    function cartCount() {
        return cart.reduce(function (s, i) { return s + i.qty; }, 0);
    }

    function cartTotal() {
        return cart.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
    }

    function addToCart(book) {
        var found = cart.filter(function (i) { return i.id === book.id; })[0];
        if (found) {
            found.qty += 1;
        } else {
            cart.push({ id: book.id, title: book.title, price: book.price, img: book.img, qty: 1 });
        }
        saveCart();
        renderCart();
        bumpBadge();
    }

    function changeQty(id, delta) {
        var item = cart.filter(function (i) { return i.id === id; })[0];
        if (!item) return;
        item.qty += delta;
        if (item.qty <= 0) {
            cart = cart.filter(function (i) { return i.id !== id; });
        }
        saveCart();
        renderCart();
    }

    function removeItem(id) {
        cart = cart.filter(function (i) { return i.id !== id; });
        saveCart();
        renderCart();
    }

    function clearCart() {
        cart = [];
        saveCart();
        renderCart();
    }

    /* --- Savat UI (JS o'zi yaratadi, HTML o'zgartirish shart emas) --- */
    var cartBtn, cartBadge, drawer, overlay, listEl, totalEl;

    function buildCartUI() {
        cartBtn = document.createElement('button');
        cartBtn.id = 'cart-btn';
        cartBtn.type = 'button';
        cartBtn.setAttribute('aria-label', 'Savat');
        cartBtn.innerHTML =
            '<img src="' + ROOT + 'images/savat.png" alt="" onerror="this.replaceWith(document.createTextNode(\'🛒\'))">' +
            '<span id="cart-badge">0</span>';
        document.body.appendChild(cartBtn);
        cartBadge = cartBtn.querySelector('#cart-badge');

        overlay = document.createElement('div');
        overlay.id = 'cart-overlay';
        document.body.appendChild(overlay);

        drawer = document.createElement('aside');
        drawer.id = 'cart-drawer';
        drawer.innerHTML =
            '<div class="cart-head">' +
            '  <h2>Savat</h2>' +
            '  <button type="button" id="cart-close" aria-label="Yopish">&times;</button>' +
            '</div>' +
            '<div id="cart-list"></div>' +
            '<div class="cart-foot">' +
            '  <div class="cart-total"><span>Jami:</span><strong id="cart-total">0.00$</strong></div>' +
            '  <button type="button" id="cart-checkout">Buyurtma berish</button>' +
            '  <button type="button" id="cart-clear">Savatni tozalash</button>' +
            '</div>';
        document.body.appendChild(drawer);

        listEl = drawer.querySelector('#cart-list');
        totalEl = drawer.querySelector('#cart-total');

        cartBtn.addEventListener('click', openCart);
        overlay.addEventListener('click', closeCart);
        drawer.querySelector('#cart-close').addEventListener('click', closeCart);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeCart();
        });

        drawer.querySelector('#cart-clear').addEventListener('click', function () {
            if (cart.length && confirm("Savatdagi hamma kitoblar o'chirilsinmi?")) clearCart();
        });

        drawer.querySelector('#cart-checkout').addEventListener('click', function () {
            if (!cart.length) {
                toast("Savat bo'sh", 'error');
                return;
            }
            if (sessionStorageLogged() === false) {
                toast("Buyurtma berish uchun avval ro'yxatdan o'ting", 'error');
                setTimeout(function () { location.href = ROOT + 'register.html'; }, 1200);
                return;
            }
            var summary = money(cartTotal());
            clearCart();
            closeCart();
            toast('Buyurtma qabul qilindi! Jami: ' + summary, 'success');
        });

        // + / − / o'chirish (event delegation)
        listEl.addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-act]');
            if (!btn) return;
            var id = btn.getAttribute('data-id');
            var act = btn.getAttribute('data-act');
            if (act === 'plus') changeQty(id, 1);
            else if (act === 'minus') changeQty(id, -1);
            else if (act === 'del') removeItem(id);
        });
    }

    function openCart() {
        drawer.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeCart() {
        if (!drawer) return;
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function bumpBadge() {
        cartBtn.classList.remove('bump');
        void cartBtn.offsetWidth; // animatsiyani qayta ishga tushirish
        cartBtn.classList.add('bump');
    }

    function cartTitleHtml(i) {
        var b = BY_IMG[i.img];
        return b
            ? '<a href="' + bookUrl(b) + '">' + escapeHtml(i.title) + '</a>'
            : escapeHtml(i.title);
    }

    function renderCart() {
        if (!listEl) return;
        var count = cartCount();
        cartBadge.textContent = count;
        cartBadge.style.display = count ? 'flex' : 'none';

        if (!cart.length) {
            listEl.innerHTML = '<p class="cart-empty">Savat hozircha bo\'sh</p>';
        } else {
            listEl.innerHTML = cart.map(function (i) {
                return '' +
                    '<div class="cart-item">' +
                    '  <img src="' + ROOT + encodeURI(i.img) + '" alt="">' +
                    '  <div class="cart-info">' +
                    '    <p class="cart-title">' + cartTitleHtml(i) + '</p>' +
                    '    <p class="cart-price">' + money(i.price) + '</p>' +
                    '    <div class="cart-qty">' +
                    '      <button type="button" data-act="minus" data-id="' + escapeHtml(i.id) + '">−</button>' +
                    '      <span>' + i.qty + '</span>' +
                    '      <button type="button" data-act="plus" data-id="' + escapeHtml(i.id) + '">+</button>' +
                    '    </div>' +
                    '  </div>' +
                    '  <button type="button" class="cart-del" data-act="del" data-id="' + escapeHtml(i.id) + '" aria-label="O\'chirish">🗑</button>' +
                    '</div>';
            }).join('');
        }
        totalEl.textContent = money(cartTotal());
    }

    /* --- "Buy" tugmalarini ulash + kartani kitob sahifasiga bog'lash --- */
    function bindBuyButtons() {
        var cards = document.querySelectorAll('.books-link > a');
        cards.forEach(function (card) {
            var btn = card.querySelector('.button button');
            var img = card.querySelector('img');
            if (!btn || !img) return;

            var imgPath = normalizeSrc(img.getAttribute('src'));
            var info = BY_IMG[imgPath];

            var priceText = (card.querySelector('.button p') || {}).textContent || '0';
            var price = parseFloat(priceText.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
            var author = ((card.querySelector(':scope > p') || {}).textContent || '').trim();
            var title = info ? info.title : (author || 'Kitob');

            var book = { id: imgPath, title: title, price: price, img: imgPath };

            if (info) {
                // Karta bosilganda kitob sahifasi ochiladi
                card.setAttribute('href', bookUrl(info));
                img.setAttribute('alt', info.title);

                // Muallif ustiga kitob nomini qo'shamiz
                var h = document.createElement('h3');
                h.className = 'book-title';
                h.textContent = info.title;
                var authorEl = card.querySelector(':scope > p');
                if (authorEl) {
                    card.insertBefore(h, authorEl);
                    if (!authorEl.textContent.trim()) authorEl.textContent = info.author || '\u00a0';
                } else {
                    card.insertBefore(h, card.querySelector('.button'));
                }
            }

            btn.addEventListener('click', function (e) {
                e.preventDefault();   // karta havolasiga o'tib ketmasin
                e.stopPropagation();
                addToCart(book);
                toast('"' + title + '" savatga qo\'shildi', 'success');
            });

            card.addEventListener('click', function (e) {
                if (card.getAttribute('href') === '#') e.preventDefault();
            });
        });
    }

    /* =====================================================
       1b. KITOB SAHIFASI (book.html?id=...)
       ===================================================== */
    function initBookPage() {
        var box = document.getElementById('book-detail');
        if (!box) return;

        var id = new URLSearchParams(location.search).get('id');
        var book = BOOKS.filter(function (b) { return b.id === id; })[0];

        if (!book) {
            box.innerHTML = '<div class="book-notfound"><h2>Kitob topilmadi</h2>' +
                '<p>Bunday kitob mavjud emas yoki havola noto\'g\'ri.</p>' +
                '<a class="back-link" href="./index.html">&larr; Bosh sahifaga qaytish</a></div>';
            document.title = 'Kitob topilmadi';
            return;
        }

        document.title = book.title + ' — Bookshop';
        var imgSrc = ROOT + encodeURI(book.img);

        var rows = [
            ['Muallif', book.author || '—'],
            ['Bo\'lim', '<a href="' + ROOT + book.categoryPage + '">' + escapeHtml(book.category) + '</a>']
        ];
        if (book.year) rows.push(['Birinchi nashr', book.year + '-yil']);
        rows.push(['Narx', money(book.price)]);

        box.innerHTML =
            '<a class="back-link" href="javascript:history.back()">&larr; Orqaga</a>' +
            '<div class="book-page">' +
            '  <div class="book-cover"><img src="' + imgSrc + '" alt="' + escapeHtml(book.title) + '"></div>' +
            '  <div class="book-meta">' +
            '    <span class="book-chip">' + escapeHtml(book.category) + '</span>' +
            '    <h1>' + escapeHtml(book.title) + '</h1>' +
            '    <p class="book-author">' + escapeHtml(book.author || '') + '</p>' +
            '    <p class="book-price">' + money(book.price) + '</p>' +
            '    <h3>Kitob haqida</h3>' +
            '    <p class="book-desc">' + escapeHtml(book.desc || '') + '</p>' +
            '    <table class="book-table">' +
            rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') +
            '    </table>' +
            '    <div class="book-actions">' +
            '      <button type="button" id="book-buy">Savatga qo\'shish</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        var cartBook = { id: book.img, title: book.title, price: book.price, img: book.img };
        document.getElementById('book-buy').addEventListener('click', function () {
            addToCart(cartBook);
            toast('"' + book.title + '" savatga qo\'shildi', 'success');
        });

        // O'xshash kitoblar (shu bo'limdan)
        var related = BOOKS.filter(function (b) {
            return b.category === book.category && b.id !== book.id;
        }).slice(0, 5);
        var relBox = document.getElementById('related-books');
        if (relBox && related.length) {
            relBox.innerHTML = '<h2>O\'xshash kitoblar</h2><div class="related-list">' +
                related.map(function (b) {
                    return '<a href="' + bookUrl(b) + '">' +
                        '<img src="' + ROOT + encodeURI(b.img) + '" alt="' + escapeHtml(b.title) + '">' +
                        '<h3>' + escapeHtml(b.title) + '</h3>' +
                        '<p>' + money(b.price) + '</p></a>';
                }).join('') + '</div>';
        }
    }

    /* =====================================================
       2. FOYDALANUVCHI (register / login)
       ===================================================== */
    function sessionStorageLogged() {
        return load(SESSION_KEY, false) === true;
    }

    function getUser() {
        return load(USER_KEY, null);
    }

    function isEmail(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    }

    function setError(input, message) {
        clearError(input);
        input.classList.add('input-error');
        var p = document.createElement('p');
        p.className = 'field-error';
        p.textContent = message;
        input.insertAdjacentElement('afterend', p);
    }

    function clearError(input) {
        input.classList.remove('input-error');
        var next = input.nextElementSibling;
        if (next && next.classList.contains('field-error')) next.remove();
    }

    function liveClear(inputs) {
        inputs.forEach(function (inp) {
            inp.addEventListener('input', function () { clearError(inp); });
        });
    }

    /* --- register.html --- */
    function initRegister() {
        var form = document.querySelector('.login-form');
        if (!form) return;

        var name = form.querySelector('.full-name input');
        var email = form.querySelector('.email input');
        var pass = form.querySelector('.password input');
        var confirmInp = form.querySelector('.confirm input');
        var link = form.querySelector('.sign-button a');
        var button = form.querySelector('.sign-button button');
        liveClear([name, email, pass, confirmInp]);

        function submit(e) {
            if (e) e.preventDefault();
            var ok = true;

            var n = name.value.trim();
            var em = email.value.trim().toLowerCase();
            var p = pass.value;
            var c = confirmInp.value;

            if (n.length < 3) { setError(name, "Ism kamida 3 ta belgidan iborat bo'lsin"); ok = false; }
            if (!isEmail(em)) { setError(email, "Email noto'g'ri kiritilgan"); ok = false; }
            if (p.length < 6) { setError(pass, "Parol kamida 6 ta belgi bo'lsin"); ok = false; }
            if (c !== p || !c) { setError(confirmInp, 'Parollar bir xil emas'); ok = false; }

            if (!ok) return;

            save(USER_KEY, { name: n, email: em, password: p });
            save(SESSION_KEY, true);
            toast("Ro'yxatdan muvaffaqiyatli o'tdingiz!", 'success');
            setTimeout(function () { location.href = ROOT + 'index.html'; }, 900);
        }

        // <a><button> ichida bo'lgani uchun havola ham to'xtatiladi
        if (link) link.addEventListener('click', submit);
        if (button) button.addEventListener('click', submit);
        form.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submit(e);
        });
    }

    /* --- signup.html (kirish) --- */
    function initSignIn() {
        var wrap = document.querySelector('.signup');
        if (!wrap) return;

        var name = wrap.querySelector('.full-name input');
        var pass = wrap.querySelector('.password input');
        liveClear([name, pass]);

        // Kirish tugmasi HTML'da yo'q — JS qo'shadi
        var holder = document.createElement('div');
        holder.className = 'sign-button signin-extra';
        holder.innerHTML = '<button type="button">Kirish</button>';
        var googleBox = wrap.querySelector('.google-button');
        wrap.insertBefore(holder, googleBox);
        var btn = holder.querySelector('button');

        function submit() {
            var user = getUser();
            var ok = true;
            if (!name.value.trim()) { setError(name, 'Ismni kiriting'); ok = false; }
            if (!pass.value) { setError(pass, 'Parolni kiriting'); ok = false; }
            if (!ok) return;

            if (!user) {
                toast("Avval ro'yxatdan o'ting", 'error');
                setTimeout(function () { location.href = ROOT + 'register.html'; }, 1200);
                return;
            }
            if (user.name.toLowerCase() !== name.value.trim().toLowerCase() || user.password !== pass.value) {
                setError(pass, "Ism yoki parol noto'g'ri");
                return;
            }
            save(SESSION_KEY, true);
            toast('Xush kelibsiz, ' + user.name + '!', 'success');
            setTimeout(function () { location.href = ROOT + 'index.html'; }, 900);
        }

        btn.addEventListener('click', submit);
        wrap.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submit();
        });
    }

    /* --- Header'dagi Register tugmasi: kirgan bo'lsa ism + chiqish --- */
    function initHeaderUser() {
        var regLink = document.querySelector('nav a[href$="register.html"]');
        if (!regLink) return;
        var user = getUser();
        if (!user || !sessionStorageLogged()) return;

        var btn = regLink.querySelector('button');
        if (btn) btn.textContent = user.name.split(' ')[0] + ' · Chiqish';
        regLink.setAttribute('href', '#');
        regLink.addEventListener('click', function (e) {
            e.preventDefault();
            save(SESSION_KEY, false);
            toast('Tizimdan chiqdingiz');
            setTimeout(function () { location.reload(); }, 700);
        });
    }

    /* =====================================================
       3. Category sahifasida narx bo'yicha saralash
       ===================================================== */
    function initSort() {
        if (!IN_CATEGORY) return;
        var list = document.querySelector('.books-link');
        var title = document.querySelector('.container > h1');
        if (!list || !title) return;

        var select = document.createElement('select');
        select.id = 'sort-select';
        select.innerHTML =
            '<option value="default">Saralash: odatiy</option>' +
            '<option value="asc">Narx: arzondan qimmatga</option>' +
            '<option value="desc">Narx: qimmatdan arzonga</option>';
        title.insertAdjacentElement('afterend', select);

        var original = Array.prototype.slice.call(list.children);

        function priceOf(el) {
            var p = el.querySelector('.button p');
            return p ? parseFloat(p.textContent) || 0 : 0;
        }

        select.addEventListener('change', function () {
            var items = original.slice();
            if (select.value === 'asc') items.sort(function (a, b) { return priceOf(a) - priceOf(b); });
            if (select.value === 'desc') items.sort(function (a, b) { return priceOf(b) - priceOf(a); });
            items.forEach(function (el) { list.appendChild(el); });
        });
    }

    /* =====================================================
       4. Help havolasi (category sahifalarida #help-section yo'q)
       ===================================================== */
    function initHelpLink() {
        var links = document.querySelectorAll('nav a[href="#help-section"], nav a.help1');
        links.forEach(function (a) {
            a.addEventListener('click', function (e) {
                var target = document.getElementById('help-section');
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                } else {
                    e.preventDefault();
                    location.href = ROOT + 'index.html#help-section';
                }
            });
        });
    }

    /* =====================================================
       5. Qo'shimcha stillar (style.css'ni o'zgartirmaslik uchun JS qo'shadi)
       ===================================================== */
    function injectStyles() {
        var css = '' +
            '#cart-btn{position:fixed;right:22px;bottom:22px;width:58px;height:58px;border-radius:50%;border:none;background:linear-gradient(150deg,rgb(102,0,102),blueviolet,rgb(196,71,196));color:#fff;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(138,43,226,.45);z-index:900;transition:transform .2s}' +
            '#cart-btn:hover{transform:scale(1.08)}' +
            '#cart-btn img{width:28px;height:28px;object-fit:contain;filter:brightness(0) invert(1)}' +
            '#cart-btn.bump{animation:bump .35s}' +
            '@keyframes bump{40%{transform:scale(1.25)}100%{transform:scale(1)}}' +
            '#cart-badge{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 5px;border-radius:999px;background:#ff3d71;color:#fff;font:700 12px Nunito,sans-serif;align-items:center;justify-content:center;display:none}' +
            '#cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .25s;z-index:950}' +
            '#cart-overlay.open{opacity:1;pointer-events:auto}' +
            '#cart-drawer{position:fixed;top:0;right:0;height:100%;width:min(400px,100%);background:#fff;transform:translateX(100%);transition:transform .3s;z-index:960;display:flex;flex-direction:column;font-family:Nunito,sans-serif;box-shadow:-6px 0 24px rgba(0,0,0,.2)}' +
            '#cart-drawer.open{transform:translateX(0)}' +
            '.cart-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #eee}' +
            '.cart-head h2{color:blueviolet}' +
            '#cart-close{background:none;border:none;font-size:32px;line-height:1;cursor:pointer;color:#666}' +
            '#cart-list{flex:1;overflow-y:auto;padding:12px 16px}' +
            '.cart-empty{text-align:center;color:#888;margin-top:40px;font-weight:600}' +
            '.cart-item{display:flex;gap:12px;align-items:center;padding:10px;margin-bottom:10px;background:rgb(243,236,236);border-radius:14px}' +
            '.cart-item>img{width:62px;height:84px;object-fit:cover;border-radius:8px}' +
            '.cart-info{flex:1}' +
            '.cart-title{font-weight:700;font-size:15px}' +
            '.cart-price{color:rgb(166,91,236);font-weight:700;margin:2px 0 6px}' +
            '.cart-qty{display:flex;align-items:center;gap:10px}' +
            '.cart-qty button{width:26px;height:26px;border-radius:50%;border:none;background:rgb(166,91,236);color:#fff;font-size:16px;cursor:pointer}' +
            '.cart-qty span{min-width:18px;text-align:center;font-weight:700}' +
            '.cart-del{background:none;border:none;font-size:18px;cursor:pointer}' +
            '.cart-foot{padding:16px 20px;border-top:1px solid #eee;display:flex;flex-direction:column;gap:10px}' +
            '.cart-total{display:flex;justify-content:space-between;font-size:18px;font-weight:700}' +
            '#cart-checkout{padding:12px;border:none;border-radius:10px;color:#fff;font-weight:700;font-size:16px;cursor:pointer;background:linear-gradient(150deg,rgb(102,0,102),blueviolet,rgb(196,71,196))}' +
            '#cart-clear{padding:8px;border:1px solid #ccc;border-radius:10px;background:#fff;cursor:pointer;font-weight:600;color:#666}' +
            '#toast-box{position:fixed;top:20px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:1000;align-items:center}' +
            '.toast{background:#333;color:#fff;padding:10px 18px;border-radius:10px;font:600 15px Nunito,sans-serif;opacity:0;transform:translateY(-10px);transition:all .3s}' +
            '.toast.show{opacity:1;transform:translateY(0)}' +
            '.toast-success{background:#2e9e5b}.toast-error{background:#d93a3a}' +
            '.input-error{border-color:#ff3d71!important}' +
            '.field-error{color:#fff;background:rgba(217,58,58,.85);font:600 13px Nunito,sans-serif;padding:3px 10px;border-radius:6px;margin:-12px 0 14px;max-width:360px}' +
            '.signin-extra button{margin-top:10px!important;padding-left:130px!important;padding-right:130px!important;cursor:pointer}' +
            '#sort-select{margin:6px 0 16px;padding:8px 12px;border-radius:10px;border:2px solid blueviolet;color:blueviolet;font:700 15px Nunito,sans-serif;background:#fff;cursor:pointer}';
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* =====================================================
       Ishga tushirish
       ===================================================== */
    function init() {
        injectStyles();
        buildCartUI();
        renderCart();
        bindBuyButtons();
        initBookPage();
        initHeaderUser();
        initHelpLink();
        initSort();
        initRegister();
        initSignIn();

        // Boshqa tab'da savat o'zgarsa — sinxronlash
        window.addEventListener('storage', function (e) {
            if (e.key === CART_KEY) {
                cart = load(CART_KEY, []);
                renderCart();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
