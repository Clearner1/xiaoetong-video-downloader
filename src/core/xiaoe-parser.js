/**
 * XiaoE Tech course parser — extracted from opencli xiaoe adapter.
 * Runs inside Electron BrowserWindow via executeJavaScript().
 *
 * Two core scripts:
 *   1. CATALOG_SCRIPT  — returns [{title, resource_id, type, url, ...}]
 *   2. PLAY_URL_SCRIPT — returns [{title, resource_id, m3u8_url, duration_sec, method}]
 */

// ─── Catalog: get all episodes from a course/column page ───

const CATALOG_SCRIPT = `(async () => {
  // Click the "目录" tab
  var tabs = document.querySelectorAll('span, div');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].children.length === 0 && tabs[i].textContent.trim() === '目录') {
      tabs[i].click(); break;
    }
  }
  await new Promise(function(r) { setTimeout(r, 2000); });

  // Scroll to load all lazy-loaded items
  var prevScrollHeight = 0;
  for (var sc = 0; sc < 30; sc++) {
    window.scrollTo(0, 999999);
    var scrollers = document.querySelectorAll('.scroll-view, .list-wrap, .scroller, #app');
    for (var si = 0; si < scrollers.length; si++) {
      if (scrollers[si].scrollHeight > scrollers[si].clientHeight) {
        scrollers[si].scrollTop = scrollers[si].scrollHeight;
      }
    }
    await new Promise(function(r) { setTimeout(r, 800); });

    // Click any "load more" buttons
    var moreTabs = document.querySelectorAll('span, div, p');
    for (var bi = 0; bi < moreTabs.length; bi++) {
      var t = moreTabs[bi].textContent.trim();
      if ((t === '点击加载更多' || t === '展开更多' || t === '加载更多') && moreTabs[bi].clientHeight > 0) {
        try { moreTabs[bi].click(); } catch(e) {}
      }
    }

    var h = document.body.scrollHeight;
    if (sc > 3 && h === prevScrollHeight) break;
    prevScrollHeight = h;
  }
  await new Promise(function(r) { setTimeout(r, 1000); });

  var el = document.querySelector('#app');
  var store = (el && el.__vue__) ? el.__vue__.$store : null;
  if (!store) return [];
  var coreInfo = store.state.coreInfo || {};
  var resourceType = coreInfo.resource_type || 0;
  var origin = window.location.origin;
  var courseName = coreInfo.resource_name || '';

  function typeLabel(t) {
    return {1:'图文',2:'直播',3:'音频',4:'视频',6:'专栏',8:'大专栏'}[Number(t)] || String(t||'');
  }
  function buildUrl(item) {
    var u = item.jump_url || item.h5_url || item.url || '';
    return (u && !u.startsWith('http')) ? origin + u : u;
  }

  // ===== 专栏 / 大专栏 =====
  if (resourceType === 6 || resourceType === 8) {
    await new Promise(function(r) { setTimeout(r, 1000); });
    var listData = [];
    var walkList = function(vm, depth) {
      if (!vm || depth > 6 || listData.length > 0) return;
      var d = vm.$data || {};
      var keys = ['columnList', 'SingleItemList', 'chapterChildren'];
      for (var ki = 0; ki < keys.length; ki++) {
        var arr = d[keys[ki]];
        if (arr && Array.isArray(arr) && arr.length > 0 && arr[0].resource_id) {
          for (var j = 0; j < arr.length; j++) {
            var item = arr[j];
            if (!item.resource_id || !/^[pvlai]_/.test(item.resource_id)) continue;
            listData.push({
              ch: 1, chapter: courseName, no: j + 1,
              title: item.resource_title || item.title || item.chapter_title || '',
              type: typeLabel(item.resource_type || item.chapter_type),
              resource_id: item.resource_id,
              url: buildUrl(item),
            });
          }
          return;
        }
      }
      if (vm.$children) {
        for (var c = 0; c < vm.$children.length; c++) walkList(vm.$children[c], depth + 1);
      }
    };
    walkList(el.__vue__, 0);
    return listData;
  }

  // ===== 普通课程 =====
  var chapters = document.querySelectorAll('.chapter_box');
  for (var ci = 0; ci < chapters.length; ci++) {
    var vue = chapters[ci].__vue__;
    if (vue && typeof vue.getSecitonList === 'function' && (!vue.isShowSecitonsList || !vue.chapterChildren.length)) {
      if (vue.isShowSecitonsList) vue.isShowSecitonsList = false;
      try { vue.getSecitonList(); } catch(e) {}
      await new Promise(function(r) { setTimeout(r, 1500); });
    }
  }
  await new Promise(function(r) { setTimeout(r, 3000); });

  var result = [];
  chapters = document.querySelectorAll('.chapter_box');
  for (var cj = 0; cj < chapters.length; cj++) {
    var v = chapters[cj].__vue__;
    if (!v) continue;
    var chTitle = (v.chapterItem && v.chapterItem.chapter_title) || '';
    var children = v.chapterChildren || [];
    for (var ck = 0; ck < children.length; ck++) {
      var child = children[ck];
      var resId = child.resource_id || child.chapter_id || '';
      var chType = child.chapter_type || child.resource_type || 0;
      var urlPath = {1:'/v1/course/text/',2:'/v2/course/alive/',3:'/v1/course/audio/',4:'/v1/course/video/'}[Number(chType)];
      result.push({
        ch: cj + 1, chapter: chTitle, no: ck + 1,
        title: child.chapter_title || child.resource_title || '',
        type: typeLabel(chType),
        resource_id: resId,
        url: urlPath ? origin + urlPath + resId + '?type=2' : '',
      });
    }
  }
  return result;
})()`;

// ─── Play URL: extract m3u8 from a single lesson page ───

const PLAY_URL_SCRIPT = `(async () => {
  var pageUrl = window.location.href;
  var origin = window.location.origin;
  var resourceId = (pageUrl.match(/[val]_[a-f0-9]+/) || [])[0] || '';
  var productId = (pageUrl.match(/product_id=([^&]+)/) || [])[1] || '';
  var appId = (origin.match(/(app[a-z0-9]+)\\\\./) || [])[1] || '';
  var isLive = resourceId.startsWith('l_') || pageUrl.includes('/alive/');
  var m3u8Url = '', method = '', title = document.title, duration = 0;

  // Deep search Vue component tree for m3u8
  function searchVueM3u8() {
    var el = document.querySelector('#app');
    if (!el || !el.__vue__) return '';
    var walk = function(vm, d) {
      if (!vm || d > 10) return '';
      var data = vm.$data || {};
      for (var k in data) {
        if (k[0] === '_' || k[0] === '$') continue;
        var v = data[k];
        if (typeof v === 'string' && v.includes('.m3u8')) return v;
        if (typeof v === 'object' && v) {
          try {
            var s = JSON.stringify(v);
            var m = s.match(/https?:[^"]*\\\\.m3u8[^"]*/);
            if (m) return m[0].replace(/\\\\\\\\\\\\\//g, '/');
          } catch(e) {}
        }
      }
      if (vm.$children) {
        for (var c = 0; c < vm.$children.length; c++) {
          var f = walk(vm.$children[c], d + 1);
          if (f) return f;
        }
      }
      return '';
    };
    return walk(el.__vue__, 0);
  }

  // ===== Video: detail_info → getPlayUrl =====
  if (!isLive && resourceId.startsWith('v_')) {
    try {
      var detailRes = await fetch(origin + '/xe.course.business.video.detail_info.get/2.0.0', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          'bizData[resource_id]': resourceId,
          'bizData[product_id]': productId || resourceId,
          'bizData[opr_sys]': 'MacIntel',
        }),
      });
      var detail = await detailRes.json();
      var vi = (detail.data || {}).video_info || {};
      title = vi.file_name || title;
      duration = vi.video_length || 0;
      if (vi.play_sign) {
        var userId = (document.cookie.match(/ctx_user_id=([^;]+)/) || [])[1] || window.__user_id || '';
        var playRes = await fetch(origin + '/xe.material-center.play/getPlayUrl', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_app_id: appId, app_id: vi.material_app_id || appId,
            user_id: userId, play_sign: [vi.play_sign],
            play_line: 'A', opr_sys: 'MacIntel',
          }),
        });
        var playData = await playRes.json();
        if (playData.code === 0 && playData.data) {
          var m = JSON.stringify(playData.data).match(/https?:[^"]*\\\\.m3u8[^"]*/);
          if (m) { m3u8Url = m[0].replace(/\\\\\\\\u0026/g, '&').replace(/\\\\\\\\\\\\\//g, '/'); method = 'api_direct'; }
        }
      }
    } catch(e) {}
  }

  // ===== Fallback: Performance API + Vue search polling =====
  if (!m3u8Url) {
    for (var attempt = 0; attempt < 30; attempt++) {
      var entries = performance.getEntriesByType('resource');
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name.includes('.m3u8')) { m3u8Url = entries[i].name; method = 'perf_api'; break; }
      }
      if (!m3u8Url) { m3u8Url = searchVueM3u8(); if (m3u8Url) method = 'vue_search'; }
      if (m3u8Url) break;
      await new Promise(function(r) { setTimeout(r, 500); });
    }
  }

  if (!duration) {
    var vid = document.querySelector('video'), aud = document.querySelector('audio');
    if (vid && vid.duration && !isNaN(vid.duration)) duration = Math.round(vid.duration);
    if (aud && aud.duration && !isNaN(aud.duration)) duration = Math.round(aud.duration);
  }

  return { title: title, resource_id: resourceId, m3u8_url: m3u8Url, duration_sec: duration, method: method };
})()`;

module.exports = { CATALOG_SCRIPT, PLAY_URL_SCRIPT };
