package com.my.tracker;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.graphics.Color;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Dark theme status & nav bar for map UI
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0a1e3c"));
        window.setNavigationBarColor(Color.parseColor("#0a1e3c"));
        // Layout behind display cutouts (notch)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
        super.onCreate(savedInstanceState);
    }
}
