package io.github.stickmanned.dishdeals;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
