// Instalar como app: Chrome avisa con `beforeinstallprompt` cuando se puede; se guarda el evento para
// lanzarlo desde el botón de Configuración. Donde no existe (iPhone, Firefox) el botón explica los pasos.
interface InstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const standalone = () =>
	typeof window !== 'undefined' &&
	(window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true);

export const install = $state({ event: null as InstallPromptEvent | null, installed: standalone() });

if (typeof window !== 'undefined') {
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		install.event = e as InstallPromptEvent;
	});
	window.addEventListener('appinstalled', () => {
		install.event = null;
		install.installed = true;
	});
}

/** Lanza el aviso del navegador; devuelve false si no hay (hay que explicar los pasos a mano). */
export async function promptInstall(): Promise<boolean> {
	const e = install.event;
	if (!e) return false;
	install.event = null;
	await e.prompt();
	const { outcome } = await e.userChoice;
	if (outcome === 'accepted') install.installed = true;
	return true;
}

export const isIos = () =>
	typeof navigator !== 'undefined' &&
	(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
