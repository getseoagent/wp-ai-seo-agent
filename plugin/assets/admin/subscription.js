(function () {
	var cfg = window.seoAgentSub || {};
	var btn = document.getElementById('seoagent-cancel-sub');
	if (!btn) return;

	btn.addEventListener('click', async function () {
		if (!confirm(cfg.confirmMsg)) return;
		btn.disabled = true;
		try {
			var res = await fetch(cfg.ajaxUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					action: 'seoagent_cancel_subscription',
					_wpnonce: cfg.nonce,
				}).toString(),
				credentials: 'same-origin',
			});
			if (res.ok) {
				location.reload();
			} else {
				alert(cfg.failGenericMsg);
				btn.disabled = false;
			}
		} catch (e) {
			alert(cfg.failPrefixMsg + ' ' + e.message);
			btn.disabled = false;
		}
	});
})();
