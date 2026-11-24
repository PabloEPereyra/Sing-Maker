// Términos, política de privacidad y precios de Vocal Quest, en español e inglés. Las páginas /terms, /privacy y
// /pricing los muestran según el idioma elegido. Si cambia algo de fondo (qué datos se guardan, proveedores, precios,
// reembolsos), actualizar el texto y la fecha.
import {
	ANON_LIMITS,
	CREDIT_COSTS,
	PUBLIC_PACKS,
	REFUND_DAYS,
	WELCOME_CREDITS,
	jobPrice
} from './pricing';
import type { Lang } from './settings.svelte';

/** Responsable del servicio. */
export const OWNER_NAME = 'Pablo Pereyra';
export const OWNER_COUNTRY: Record<Lang, string> = {
	es: 'Argentina',
	en: 'Argentina'
};
export const CONTACT_EMAIL = 'hola@vocal.quest';
export const UPDATED: Record<Lang, string> = {
	es: '24 de noviembre de 2026',
	en: 'November 24, 2026'
};

export interface LegalSection {
	title: string;
	/** Párrafos; los que empiezan con «• » se muestran como lista. */
	body: string[];
}

export interface LegalDoc {
	title: string;
	intro: string;
	sections: LegalSection[];
}

const owner = (lang: Lang) => `${OWNER_NAME} (${OWNER_COUNTRY[lang]})`;

export function termsDoc(lang: Lang): LegalDoc {
	if (lang === 'en')
		return {
			title: 'Terms of use',
			intro: `These terms govern the use of Vocal Quest (vocal.quest), a service run by ${owner('en')}. By using the site you accept them. If you do not agree, please do not use it.`,
			sections: [
				{
					title: '1. The service',
					body: [
						'Vocal Quest is a web app for practising vocal exercises: you sing and a character follows your voice. It also has AI features that create exercises, characters, objects and backgrounds, transcribe what you say and give recommendations after an exercise.'
					]
				},
				{
					title: '2. Age',
					body: [
						'The AI features use models from Meta, whose terms only allow people aged 18 or over. Before using them you must confirm that you are 18 or older. If you are under 18, do not use the AI features.',
						'Creating an account and buying credits are also only for people aged 18 or over.',
						'Vocal Quest is not designed for children. If we learn that a minor has used the AI features or created an account, we may block that access and delete the related data.'
					]
				},
				{
					title: '3. Free allowance and credits',
					body: [
						'Without an account you can try a few AI uses for free. When you create an account you get free credits once per person (one per email, and a limited number of accounts per network). We may change the free allowance and the free credits at any time, and we do not give them to temporary email addresses.',
						'Free credits are spent before purchased ones and are not refundable. After that, the AI features are paid for with credits bought in packs. The profile menu shows how many credits each type of use costs before you use it.',
						'Credits have no monetary value outside Vocal Quest, cannot be transferred or exchanged for money, and are tied to the email of your account.',
						'Credits do not expire while the service is running. If we ever close the service, we will announce it at least 30 days in advance.',
						'If an AI request fails because of an error on our side, the credits for that request are returned automatically.'
					]
				},
				{
					title: '4. Payments and refunds',
					body: [
						'Payments are processed by Dodo Payments, which acts as the reseller (merchant of record). The price shown at checkout is the one charged, including any applicable taxes.',
						`You can ask for a full refund within ${REFUND_DAYS} days of a purchase as long as you have not used any credits from that pack. Write to ${CONTACT_EMAIL} from the email of your account. When the refund is processed, the credits of that pack are removed from your balance.`,
						'This does not limit any additional rights that consumer law in your country gives you.'
					]
				},
				{
					title: '5. AI-generated content',
					body: [
						'AI-generated content (exercises, recommendations, images, transcriptions) can contain errors. Check it before relying on it.',
						'Vocal Quest is a practice tool, not a medical or professional service. If you feel pain, hoarseness that does not go away or any other voice problem, stop and see a health professional.',
						'You are responsible for what you write, say or upload, and you must have the right to use it (for example, sheet music or images that belong to someone else). You may use what the AI creates for you, but we do not guarantee that it is unique or free from third-party rights.'
					]
				},
				{
					title: '6. Acceptable use',
					body: [
						'You agree not to:',
						'• get around the free allowance, credits, the age confirmation or any other limit',
						'• access the service with bots or automated scripts, or resell access to it',
						'• use it to create illegal, violent, sexual, hateful or harassing content, or content that infringes the rights of others',
						'• try to break, overload or reverse-engineer the service',
						"The AI features must also be used in line with Meta's Acceptable Use Policy for its Model API. We may suspend accounts that break these rules; credits lost in that case are not refunded."
					]
				},
				{
					title: '7. Availability and liability',
					body: [
						'The service is provided "as is". We try to keep it working, but we do not guarantee that it will always be available or free of errors, and features may change.',
						'To the extent allowed by law, our total liability to you is limited to the amount you paid us in the 12 months before the claim.'
					]
				},
				{
					title: '8. Privacy',
					body: ['How we handle your data is explained in the Privacy policy.']
				},
				{
					title: '9. Changes and applicable law',
					body: [
						'We may update these terms. If the changes are important, we will announce them on the site before they apply. Continuing to use the service after that means you accept them.',
						`These terms are governed by the laws of ${OWNER_COUNTRY.en}, without prejudice to the mandatory consumer protections of your country of residence.`
					]
				},
				{
					title: '10. Contact',
					body: [`Questions about these terms: ${CONTACT_EMAIL}.`]
				}
			]
		};
	return {
		title: 'Términos de uso',
		intro: `Estos términos regulan el uso de Vocal Quest (vocal.quest), un servicio a cargo de ${owner('es')}. Al usar el sitio los aceptas. Si no estás de acuerdo, no lo uses.`,
		sections: [
			{
				title: '1. El servicio',
				body: [
					'Vocal Quest es una app web para practicar ejercicios vocales: cantas y un personaje sigue tu voz. También tiene funciones con IA que crean ejercicios, personajes, objetos y fondos, pasan a texto lo que dices y dan recomendaciones al terminar un ejercicio.'
				]
			},
			{
				title: '2. Edad',
				body: [
					'Las funciones con IA usan modelos de Meta, cuyos términos solo permiten su uso a personas de 18 años o más. Antes de usarlas tienes que confirmar que tienes 18 años o más. Si eres menor de 18, no uses las funciones con IA.',
					'Crear una cuenta y comprar créditos también es solo para personas de 18 años o más.',
					'Vocal Quest no está pensado para niños. Si sabemos que una persona menor de edad usó las funciones con IA o creó una cuenta, podemos bloquear ese acceso y borrar los datos relacionados.'
				]
			},
			{
				title: '3. Cupo gratis y créditos',
				body: [
					'Sin cuenta puedes probar gratis algunos usos de la IA. Al crear tu cuenta recibes créditos de regalo una vez por persona (uno por email y una cantidad limitada de cuentas por red). Podemos cambiar el cupo gratis y los créditos de regalo en cualquier momento, y no los damos a emails temporales.',
					'Los créditos de regalo se gastan antes que los comprados y no se reembolsan. Después, las funciones con IA se pagan con créditos que se compran en paquetes. El menú de tu perfil muestra cuántos créditos cuesta cada tipo de uso antes de usarlo.',
					'Los créditos no tienen valor en dinero fuera de Vocal Quest, no se pueden transferir ni cambiar por dinero, y quedan asociados al email de tu cuenta.',
					'Los créditos no vencen mientras el servicio esté activo. Si alguna vez cerramos el servicio, lo avisaremos con al menos 30 días de anticipación.',
					'Si un pedido a la IA falla por un error nuestro, los créditos de ese pedido se devuelven solos.'
				]
			},
			{
				title: '4. Pagos y reembolsos',
				body: [
					'Los pagos los procesa Dodo Payments, que actúa como revendedor (merchant of record). El precio que ves al pagar es el que se cobra, con los impuestos que correspondan.',
					`Puedes pedir el reembolso completo dentro de los ${REFUND_DAYS} días de una compra, siempre que no hayas usado créditos de ese paquete. Escríbenos a ${CONTACT_EMAIL} desde el email de tu cuenta. Al reembolsarse, los créditos de ese paquete se descuentan de tu saldo.`,
					'Esto no limita otros derechos que te dé la ley de defensa del consumidor de tu país.'
				]
			},
			{
				title: '5. Contenido creado con IA',
				body: [
					'Lo que crea la IA (ejercicios, recomendaciones, imágenes, transcripciones) puede tener errores. Revísalo antes de confiar en él.',
					'Vocal Quest es una herramienta de práctica, no un servicio médico ni profesional. Si sientes dolor, una ronquera que no se va o cualquier otro problema en la voz, detente y consulta a un profesional de la salud.',
					'Eres responsable de lo que escribes, dices o subes, y tienes que tener derecho a usarlo (por ejemplo, partituras o imágenes de otras personas). Puedes usar lo que la IA crea para ti, pero no garantizamos que sea único ni que esté libre de derechos de terceros.'
				]
			},
			{
				title: '6. Uso aceptable',
				body: [
					'Te comprometes a no:',
					'• esquivar el cupo gratis, los créditos, la confirmación de edad ni ningún otro límite',
					'• usar el servicio con bots o scripts automáticos, ni revender el acceso',
					'• usarlo para crear contenido ilegal, violento, sexual, de odio o de acoso, o que infrinja derechos de otras personas',
					'• intentar romper, sobrecargar o desarmar el servicio',
					'Las funciones con IA también deben usarse según la Política de uso aceptable de Meta para su Model API. Podemos suspender las cuentas que no cumplan estas reglas; en ese caso, los créditos perdidos no se reembolsan.'
				]
			},
			{
				title: '7. Disponibilidad y responsabilidad',
				body: [
					'El servicio se ofrece «tal cual». Tratamos de que funcione bien, pero no garantizamos que esté siempre disponible ni libre de errores, y las funciones pueden cambiar.',
					'En la medida en que la ley lo permita, nuestra responsabilidad total ante ti se limita a lo que nos pagaste en los 12 meses anteriores al reclamo.'
				]
			},
			{
				title: '8. Privacidad',
				body: ['Cómo tratamos tus datos se explica en la Política de privacidad.']
			},
			{
				title: '9. Cambios y ley aplicable',
				body: [
					'Podemos actualizar estos términos. Si los cambios son importantes, los avisaremos en el sitio antes de que se apliquen. Seguir usando el servicio después significa que los aceptas.',
					`Estos términos se rigen por las leyes de ${OWNER_COUNTRY.es}, sin perjuicio de las protecciones al consumidor obligatorias de tu país de residencia.`
				]
			},
			{
				title: '10. Contacto',
				body: [`Consultas sobre estos términos: ${CONTACT_EMAIL}.`]
			}
		]
	};
}

export function privacyDoc(lang: Lang): LegalDoc {
	if (lang === 'en')
		return {
			title: 'Privacy policy',
			intro: `This policy explains what data Vocal Quest (vocal.quest) handles, why and with whom it is shared. The controller is ${owner('en')}, contact: ${CONTACT_EMAIL}.`,
			sections: [
				{
					title: '1. What stays on your device',
					body: [
						'Your progress, settings, the exercises, characters and backgrounds you create, and your history are saved in your browser (local storage). They are not sent to our servers. Clearing the site data deletes them.',
						'The microphone is used to follow your voice while you sing. That analysis happens on your device and the audio is not sent anywhere, except for dictation (see section 3).'
					]
				},
				{
					title: '2. What we store on our servers',
					body: [
						'• A random anonymous identifier created by your browser, with how many AI uses it has consumed from the free allowance.',
						'• The date on which you confirmed being 18 or older (linked to that identifier or to your account).',
						'• If you create an account: your email, your credit balance, the history of credit movements (free credits, purchases, uses and refunds) and your open sessions. We do not use passwords: you sign in with a link sent to your email.',
						'• When an account receives the free credits: a hash of your email without aliases and a hash of your network (IP address), with the date, so that the free credits are given once per person and a limited number of times per network. We do not store the IP address itself.',
						'• Sign-in links are stored only as a hash, expire and can be used once.',
						'We use them to count the free allowance, give the free credits, charge credits, let you sign in and keep your balance on any device.'
					]
				},
				{
					title: '3. What we send to the AI',
					body: [
						'When you use an AI feature, what that feature needs is sent to the Meta Model API: the text you write, the images you upload (sheet music or drawings), the dictation audio, the summary of how an exercise went, or the description of a character or background.',
						'We use the standard models of the Meta Model API, for which Meta states that it does not use the content of requests to train its models. We do not keep that content on our servers; the results are saved in your browser.',
						'Do not include personal or sensitive information in what you send to the AI.'
					]
				},
				{
					title: '4. Payments',
					body: [
						'Purchases are processed by Dodo Payments. You enter your card details on its page; we never see them. We receive the payment identifier, its status, the pack bought and the email, so we can add the credits to your account.'
					]
				},
				{
					title: '5. Providers',
					body: [
						'• Cloudflare: hosts the site and the database.',
						'• Meta (Model API): AI features.',
						'• Resend: sends the sign-in emails.',
						'• Dodo Payments: processes payments.',
						'• Google Fonts and Bunny CDN: serve the fonts and the piano and drum sounds; like any web server, they receive your IP address.',
						'Some of these providers process data in the United States or other countries. We do not sell your data, we do not show ads and we do not use analytics or advertising trackers.'
					]
				},
				{
					title: '6. Cookies',
					body: [
						'We only use one cookie, vq_session, to keep your session open if you sign in. It is essential, lasts up to 60 days and is deleted when you sign out.'
					]
				},
				{
					title: '7. How long we keep the data',
					body: [
						'Account data is kept while the account exists. The anonymous allowance counters are kept while the service runs. When you delete your account we delete your email and sessions; we may keep the purchase records that accounting or tax law requires.'
					]
				},
				{
					title: '8. Your rights',
					body: [
						`You can ask to access, correct, export or delete your data, or object to its use, by writing to ${CONTACT_EMAIL} from the email of your account. We reply within 30 days. You can also complain to the data protection authority of your country.`
					]
				},
				{
					title: '9. Minors',
					body: [
						'The AI features, accounts and purchases are only for people aged 18 or over, and Vocal Quest is not aimed at children. If we learn that we hold data of a minor, we delete it.'
					]
				},
				{
					title: '10. Changes',
					body: [
						'If we change this policy, we will update the date. If the changes are important, we will announce them on the site.'
					]
				}
			]
		};
	return {
		title: 'Política de privacidad',
		intro: `Esta política explica qué datos maneja Vocal Quest (vocal.quest), para qué y con quién se comparten. El responsable es ${owner('es')}, contacto: ${CONTACT_EMAIL}.`,
		sections: [
			{
				title: '1. Lo que queda en tu dispositivo',
				body: [
					'Tu progreso, la configuración, los ejercicios, personajes y fondos que creas y tu historial se guardan en tu navegador (almacenamiento local). No se envían a nuestros servidores. Si borras los datos del sitio, se pierden.',
					'El micrófono se usa para seguir tu voz mientras cantas. Ese análisis se hace en tu dispositivo y el audio no se envía a ningún lado, salvo en el dictado (ver el punto 3).'
				]
			},
			{
				title: '2. Lo que guardamos en nuestros servidores',
				body: [
					'• Un identificador anónimo al azar que crea tu navegador, con cuántos usos de la IA consumió del cupo gratis.',
					'• La fecha en que confirmaste tener 18 años o más (asociada a ese identificador o a tu cuenta).',
					'• Si creas una cuenta: tu email, tu saldo de créditos, el historial de movimientos de créditos (regalos, compras, usos y reembolsos) y tus sesiones abiertas. No usamos contraseñas: entras con un enlace que te llega por email.',
					'• Cuando una cuenta recibe los créditos de regalo: un hash de tu email sin alias y un hash de tu red (dirección IP), con la fecha, para dar el regalo una vez por persona y una cantidad limitada de veces por red. No guardamos la dirección IP.',
					'• Los enlaces para entrar se guardan solo como un hash, vencen y se usan una sola vez.',
					'Los usamos para contar el cupo gratis, dar los créditos de regalo, cobrar los créditos, dejarte entrar y mantener tu saldo en cualquier dispositivo.'
				]
			},
			{
				title: '3. Lo que enviamos a la IA',
				body: [
					'Cuando usas una función con IA, se envía a Meta Model API lo que esa función necesita: el texto que escribes, las imágenes que subes (partituras o dibujos), el audio del dictado, el resumen de cómo te fue en un ejercicio o la descripción de un personaje o fondo.',
					'Usamos los modelos estándar de Meta Model API, para los que Meta indica que no usa el contenido de los pedidos para entrenar sus modelos. No guardamos ese contenido en nuestros servidores; los resultados quedan en tu navegador.',
					'No incluyas datos personales o sensibles en lo que envías a la IA.'
				]
			},
			{
				title: '4. Pagos',
				body: [
					'Las compras las procesa Dodo Payments. Los datos de tu tarjeta los escribes en su página; nosotros nunca los vemos. Recibimos el identificador del pago, su estado, el paquete comprado y el email, para sumar los créditos a tu cuenta.'
				]
			},
			{
				title: '5. Proveedores',
				body: [
					'• Cloudflare: aloja el sitio y la base de datos.',
					'• Meta (Model API): funciones con IA.',
					'• Resend: envía los emails para entrar.',
					'• Dodo Payments: procesa los pagos.',
					'• Google Fonts y Bunny CDN: sirven las tipografías y los sonidos de piano y batería; como cualquier servidor web, reciben tu dirección IP.',
					'Algunos de estos proveedores tratan datos en Estados Unidos o en otros países. No vendemos tus datos, no mostramos publicidad y no usamos herramientas de analítica ni de seguimiento publicitario.'
				]
			},
			{
				title: '6. Cookies',
				body: [
					'Solo usamos una cookie, vq_session, para mantener tu sesión abierta si entras con tu cuenta. Es necesaria, dura hasta 60 días y se borra al cerrar la sesión.'
				]
			},
			{
				title: '7. Cuánto tiempo guardamos los datos',
				body: [
					'Los datos de la cuenta se guardan mientras la cuenta exista. Los contadores anónimos del cupo se guardan mientras el servicio funcione. Si borras tu cuenta, borramos tu email y tus sesiones; podemos conservar los registros de compras que exija la ley contable o impositiva.'
				]
			},
			{
				title: '8. Tus derechos',
				body: [
					`Puedes pedir acceder a tus datos, corregirlos, exportarlos o borrarlos, u oponerte a su uso, escribiendo a ${CONTACT_EMAIL} desde el email de tu cuenta. Respondemos dentro de los 30 días. También puedes reclamar ante la autoridad de protección de datos de tu país.`
				]
			},
			{
				title: '9. Menores de edad',
				body: [
					'Las funciones con IA, las cuentas y las compras son solo para personas de 18 años o más, y Vocal Quest no está dirigido a niños. Si sabemos que tenemos datos de una persona menor de edad, los borramos.'
				]
			},
			{
				title: '10. Cambios',
				body: [
					'Si cambiamos esta política, actualizaremos la fecha. Si los cambios son importantes, los avisaremos en el sitio.'
				]
			}
		]
	};
}

/** Precios: cupo gratis, paquetes y lo que cuesta cada uso, con los números de src/lib/pricing.ts. */
export function pricingDoc(lang: Lang): LegalDoc {
	const a = ANON_LIMITS;
	const w = WELCOME_CREDITS;
	const c = CREDIT_COSTS;
	const character = jobPrice('character');
	const money = (n: number) => `US$ ${n}`;
	if (lang === 'en')
		return {
			title: 'Pricing',
			intro:
				'Playing Vocal Quest is free. To create with AI you get free credits when you create your account and, after that, you pay with credits bought once, with no subscription.',
			sections: [
				{
					title: 'Free',
					body: [
						'• All the exercises in the game, the level test, the daily routine, video recording and the coach without AI, with no limit.',
						`• Without an account: ${a.exercises} exercises with AI to try it out.`,
						`• When you create your account: ${w} free credits, once per person. They are enough for about ${Math.floor(w / character)} complete characters, or ${w} exercises, or a mix.`
					]
				},
				{
					title: 'Credit packs',
					body: [
						...PUBLIC_PACKS.map((p) => `• ${p.credits} credits: ${money(p.price)}`),
						'One-time payment. Credits do not expire while the service is running. Payments are processed by Dodo Payments as the reseller (merchant of record); depending on your country, taxes may be added, and the total is shown before you confirm.'
					]
				},
				{
					title: 'What each use costs',
					body: [
						'Paid with your free or purchased credits:',
						`• Create an exercise or a drum pattern with AI: ${c.exercises} credit`,
						`• Create a character: ${character} credits, with its animations and any image the AI has to repeat included (${jobPrice('character-photo')} from a photo)`,
						`• Create an object to collect: ${jobPrice('item')} credits (${jobPrice('item-photo')} from a photo)`,
						`• Retouch a character: ${jobPrice('retouch')} credits for all of it, or ${jobPrice('retouch-sheet')} for a single animation`,
						`• Create or retouch a background: ${c.images} credits`,
						'If you cancel a character or an object, you get back the credits of the images that were not requested. If it fails, you get them all back (up to 2 times a day; after that, the same as when cancelling).',
						'• AI coach, dictation and helper steps: no cost for people who have credits',
						'If an AI request fails because of an error on our side, its credits are returned automatically. The profile menu shows your balance.'
					]
				},
				{
					title: 'Refunds',
					body: [
						`You can ask for a full refund within ${REFUND_DAYS} days of a purchase as long as you have not used any credits from that pack. Write to ${CONTACT_EMAIL} from the email of your account. The details are in the terms of use.`
					]
				},
				{
					title: 'Who can buy',
					body: [
						"The AI features, accounts and purchases are only for people aged 18 or over (a requirement of Meta's AI models). The rest of the game is for everyone."
					]
				}
			]
		};
	return {
		title: 'Precios',
		intro:
			'Jugar a Vocal Quest es gratis. Para crear con IA recibes créditos de regalo al crear tu cuenta y, después, pagas con créditos que se compran una sola vez, sin suscripción.',
		sections: [
			{
				title: 'Gratis',
				body: [
					'• Todos los ejercicios del juego, la prueba de nivel, la rutina diaria, la grabación de videos y el entrenador sin IA, sin límite.',
					`• Sin cuenta: ${a.exercises} ejercicios con IA para probar.`,
					`• Al crear tu cuenta: ${w} créditos de regalo, una vez por persona. Alcanzan para unos ${Math.floor(w / character)} personajes completos, o ${w} ejercicios, o una mezcla.`
				]
			},
			{
				title: 'Paquetes de créditos',
				body: [
					...PUBLIC_PACKS.map((p) => `• ${p.credits} créditos: ${money(p.price)}`),
					'Pago único. Los créditos no vencen mientras el servicio esté activo. Los pagos los procesa Dodo Payments como revendedor (merchant of record); según tu país se pueden sumar impuestos, y el total se muestra antes de confirmar.'
				]
			},
			{
				title: 'Cuánto cuesta cada uso',
				body: [
					'Se paga con tus créditos de regalo o comprados:',
					`• Crear un ejercicio o un ritmo con IA: ${c.exercises} crédito`,
					`• Crear un personaje: ${character} créditos, con sus animaciones y las imágenes que la IA tenga que repetir incluidas (${jobPrice('character-photo')} desde una foto)`,
					`• Crear un objeto para recoger: ${jobPrice('item')} créditos (${jobPrice('item-photo')} desde una foto)`,
					`• Retocar un personaje: ${jobPrice('retouch')} créditos todo, o ${jobPrice('retouch-sheet')} una sola animación`,
					`• Crear o retocar un fondo: ${c.images} créditos`,
					'Si cancelas un personaje o un objeto, se devuelven los créditos de las imágenes que no se llegaron a pedir. Si falla, se devuelven todos (hasta 2 veces por día; después, igual que al cancelar).',
					'• Entrenador con IA, dictado y pasos auxiliares: sin costo para quien tiene créditos',
					'Si un pedido a la IA falla por un error nuestro, sus créditos se devuelven solos. El menú de tu perfil muestra tu saldo.'
				]
			},
			{
				title: 'Reembolsos',
				body: [
					`Puedes pedir el reembolso completo dentro de los ${REFUND_DAYS} días de una compra, siempre que no hayas usado créditos de ese paquete. Escríbenos a ${CONTACT_EMAIL} desde el email de tu cuenta. El detalle está en los términos de uso.`
				]
			},
			{
				title: 'Quién puede comprar',
				body: [
					'Las funciones con IA, las cuentas y las compras son solo para personas de 18 años o más (un requisito de los modelos de IA de Meta). El resto del juego es para todos.'
				]
			}
		]
	};
}
