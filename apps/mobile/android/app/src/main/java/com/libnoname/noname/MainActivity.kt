package com.libnoname.noname

import android.os.Bundle
import android.util.Log
import android.webkit.ServiceWorkerClient
import android.webkit.ServiceWorkerController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SafFsPlugin::class.java)
        super.onCreate(savedInstanceState)

        // 系统栏被滑动唤出时只作临时显示，随后自动隐藏；默认行为会一直留在屏幕上挡住 WebView
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        val webView = bridge.webView
        if (BuildConfig.DEBUG) {
            webView.loadUrl("http://10.0.2.2:8080")
            return
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("localhost")
            .addPathHandler("/", JsAwarePathHandler(this, "public"))
            .build()

        webView.webViewClient = object : WebViewClient(){
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return if (request.url.host == "localhost") {
                    assetLoader.shouldInterceptRequest(request.url)
                        ?: bridge.webViewClient.shouldInterceptRequest(view, request)
                } else {
                    bridge.webViewClient.shouldInterceptRequest(view, request)
                }
            }
        }

        if (bridge.config.isResolveServiceWorkerRequests) {
            val swController = ServiceWorkerController.getInstance()
            swController.setServiceWorkerClient(
                object : ServiceWorkerClient() {
                    override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
                        return if (request.url.host == "localhost") {
                            assetLoader.shouldInterceptRequest(request.url)
                                ?: bridge.localServer.shouldInterceptRequest(request)
                        } else {
                            bridge.localServer.shouldInterceptRequest(request)
                        }
                    }
                }
            )
        }

        webView.loadUrl("https://localhost/index.html")
    }
}
