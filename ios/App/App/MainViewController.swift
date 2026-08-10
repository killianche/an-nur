import UIKit
import Capacitor

/// Подкласс моста Capacitor — нужен ровно ради одной вещи: отключить
/// «резинку» прокрутки WKWebView.
///
/// Проблема, которую он решает. Если оттянуть страницу у верхнего края,
/// WebKit сдвигает вместе с содержимым и элементы `position: fixed` —
/// верхняя панель уезжает вниз, а над ней открывается пустая полоса.
/// В вебе это лечится `overscroll-behavior: none`, но в WKWebView жест
/// перехватывает нативный `UIScrollView` раньше, чем он доходит до
/// страницы, и CSS до него не достаёт. Проверено на устройстве: одного
/// CSS оказалось мало.
///
/// Прокрутку саму по себе не трогаем — выключается только пружина на
/// границах документа.
///
/// Класс подставляется в `Base.lproj/Main.storyboard` вместо
/// `CAPBridgeViewController`. Если когда-нибудь `npx cap add ios`
/// переигрывается с нуля, storyboard вернётся к базовому классу и эту
/// правку нужно будет повторить.
class MainViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
        // Масштабирование страницы жестами тоже ни к чему: размер текста
        // меняется настройками чтения. Meta viewport это уже запрещает,
        // здесь — страховка на уровне вьюшки.
        webView?.scrollView.bouncesZoom = false
        webView?.scrollView.maximumZoomScale = 1.0
        webView?.scrollView.minimumZoomScale = 1.0
    }
}
