import prisma from '../config/database';

// Генерация пароля (12 символов: буквы + цифры + спецсимволы)
export function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%!';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Транслитерация кириллицы в латиницу
export function transliterate(text: string): string {
  const map: { [key: string]: string } = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    // Казахские буквы
    'ә': 'a', 'ғ': 'g', 'қ': 'q', 'ң': 'n', 'ө': 'o', 'ұ': 'u', 'ү': 'u', 'һ': 'h', 'і': 'i',
  };

  return text
    .toLowerCase()
    .split('')
    .map(char => map[char] || char)
    .join('')
    .replace(/[^a-z0-9]/g, '');
}

// Генерация логина из ФИО (фамилия + первая буква имени)
export async function generateLogin(fullName: string): Promise<string> {
  const parts = fullName.trim().split(/\s+/);
  let baseLogin = '';

  if (parts.length >= 2) {
    // Фамилия + первая буква имени
    const surname = transliterate(parts[0]);
    const firstNameInitial = transliterate(parts[1].charAt(0));
    baseLogin = surname + firstNameInitial;
  } else {
    baseLogin = transliterate(parts[0]);
  }

  // Проверка уникальности и добавление номера если нужно
  let login = baseLogin;
  let counter = 1;

  while (await prisma.user.findUnique({ where: { login } })) {
    login = `${baseLogin}${counter}`;
    counter++;
  }

  return login;
}
