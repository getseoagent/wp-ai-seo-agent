(function () {
	var cfg = window.seoAgentDiagnose || {};
	var btn = document.getElementById('seoagent-diagnose-btn');
	var copy = document.getElementById('seoagent-diagnose-copy');
	var out = document.getElementById('seoagent-diagnose-out');
	if (!btn) return;
	var lastReport = '';

	btn.addEventListener('click', async function () {
		btn.disabled = true;
		out.style.display = 'block';
		out.textContent = cfg.runningMsg;
		try {
			var res = await fetch(cfg.diagnoseUrl, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-wp-nonce': cfg.diagnoseNonce,
				},
				credentials: 'same-origin',
				body: '{}',
			});
			var data = await res.json();
			lastReport = formatReport(data);
			out.textContent = lastReport;
			copy.style.display = 'inline-block';
		} catch (e) {
			out.textContent = cfg.failMsg + ' ' + e.message;
		} finally {
			btn.disabled = false;
		}
	});

	copy.addEventListener('click', async function () {
		try {
			await navigator.clipboard.writeText(lastReport);
			copy.textContent = cfg.copiedMsg;
			setTimeout(function () {
				copy.textContent = cfg.copyMsg;
			}, 2000);
		} catch (e) {
			window.getSelection().selectAllChildren(out);
		}
	});

	function formatReport(d) {
		var ok = '✓', bad = '✗', skip = '~';
		var lines = [];
		lines.push('# GetSEOAgent diagnostic');
		lines.push('plugin: ' + d.plugin_version + ' · WP ' + d.wp_version + ' · PHP ' + d.php_version);
		lines.push('site:    ' + d.site_url);
		lines.push('backend: ' + d.backend_url);
		lines.push('took:    ' + d.took_ms + ' ms');
		lines.push('');
		lines.push('## Configuration');
		lines.push('  ' + (d.wp_config && d.wp_config.SEO_AGENT_JWT_SECRET === 'set' ? ok : bad)
			+ ' SEO_AGENT_JWT_SECRET: ' + (d.wp_config && d.wp_config.SEO_AGENT_JWT_SECRET));
		lines.push('  ' + ok + ' SEO_AGENT_BACKEND_URL: ' + (d.wp_config && d.wp_config.SEO_AGENT_BACKEND_URL));
		lines.push('  ' + (d.anthropic_key_set ? ok : bad) + ' Anthropic API key: ' + (d.anthropic_key_set ? 'set' : 'NOT SET'));
		lines.push('  ' + (d.license_key_set ? ok : skip) + ' License key: ' + (d.license_key_set ? 'set' : 'free tier'));
		lines.push('');
		lines.push('## Backend connectivity');
		var h = d.backend_health || {};
		lines.push('  ' + (h.status === 'ok' ? ok : bad) + ' /health: ' + (h.status || '?')
			+ ' (' + (h.http_code !== undefined ? 'HTTP ' + h.http_code + ', ' : '')
			+ (h.elapsed_ms || 0) + ' ms)');
		var m = d.jwt_mint || {};
		var mIcon = m.status === 'ok' ? ok : (m.status === 'skipped' ? skip : bad);
		lines.push('  ' + mIcon + ' /auth/token mint: ' + (m.status || '?')
			+ (m.elapsed_ms ? ' (' + m.elapsed_ms + ' ms)' : '')
			+ (m.error ? ' — ' + m.error : ''));
		var c = d.jwt_cache || {};
		lines.push('  ' + (c.present ? ok : skip) + ' JWT cache: ' + (c.present ? 'present' : 'empty'));
		lines.push('');
		lines.push('--- raw ---');
		lines.push(JSON.stringify(d, null, 2));
		return lines.join('\n');
	}
})();
