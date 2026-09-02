from pathlib import Path
import shutil
import sys

PATCH_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = Path.cwd()


def fail(msg):
    print(f"\n[ОШИБКА] {msg}")
    input("Нажмите Enter для выхода...")
    sys.exit(1)


def backup(path: Path):
    bak = path.with_name(path.name + '.bak-lapsha-v2')
    if path.exists() and not bak.exists():
        shutil.copy2(path, bak)
        print(f"Резервная копия: {bak.relative_to(PROJECT_ROOT)}")


def inject_once(path: Path, needle: str, insertion: str):
    text = path.read_text(encoding='utf-8')
    if insertion.strip() in text:
        print(f"Уже подключено: {path.relative_to(PROJECT_ROOT)}")
        return
    if needle not in text:
        fail(f"Не нашёл строку для вставки в {path}: {needle}")
    text = text.replace(needle, needle + '\n' + insertion, 1)
    path.write_text(text, encoding='utf-8')
    print(f"Обновлён: {path.relative_to(PROJECT_ROOT)}")


def main():
    index = PROJECT_ROOT / 'index.html'
    admin_index = PROJECT_ROOT / 'admpan' / 'index.html'
    assets = PROJECT_ROOT / 'assets'
    admin_dir = PROJECT_ROOT / 'admpan'

    if not index.exists() or not assets.exists():
        fail('Запустите apply-update.bat из корня репозитория lapsha, где лежит index.html и папка assets.')
    if not admin_index.exists():
        fail('Не найдена admpan/index.html. Проверьте, что патч запускается в текущей версии проекта.')

    backup(index)
    backup(admin_index)

    shutil.copy2(PATCH_ROOT / 'assets' / 'lapsha-update-v2.css', assets / 'lapsha-update-v2.css')
    shutil.copy2(PATCH_ROOT / 'assets' / 'lapsha-update-v2.js', assets / 'lapsha-update-v2.js')
    shutil.copy2(PATCH_ROOT / 'admpan' / 'admin-update-v2.js', admin_dir / 'admin-update-v2.js')
    print('Скопированы новые файлы интерфейса.')

    inject_once(index,
                '<link rel="stylesheet" href="assets/style.css">',
                '<link rel="stylesheet" href="assets/lapsha-update-v2.css">')
    inject_once(index,
                '<script src="assets/app.js"></script>',
                '<script src="assets/lapsha-update-v2.js"></script>')
    inject_once(admin_index,
                '<script src="admin.js"></script>',
                '<script src="admin-update-v2.js"></script>')

    print('\nГОТОВО.')
    print('Что добавлено:')
    print('  • крупные новости-карточки со свайпом;')
    print('  • описание категории сразу под её названием;')
    print('  • плавающая лупа и быстрый переход к напитку;')
    print('  • рамки ALCO / NON ALCO / ICE / COLD;')
    print('  • быстрые кнопки этих типов в админке;')
    print('  • кнопка предпросмотра сайта в админке.')
    print('\nТеперь закоммитьте изменения в GitHub — Netlify задеплоит их как обычно.')


if __name__ == '__main__':
    main()
